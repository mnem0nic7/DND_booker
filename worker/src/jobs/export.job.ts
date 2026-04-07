import type { Job } from 'bullmq';
import type {
  DocumentContent,
  DocumentKind,
  ExportReview,
  ExportReviewAutoFix,
  ExportReviewFinding,
  ExportReviewTextLayoutParityMetrics,
  LayoutPlan,
  PageModel,
} from '@dnd-booker/shared';
import { recommendLayoutPlan, resolveLayoutPlan, resolveTextLayoutFallbackScopeIds } from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { assembleHtml } from '../renderers/html-assembler.js';
import { normalizeExportDocuments } from '../renderers/export-document-normalizer.js';
import { generateHtmlPdf, measureDocumentPageModels } from '../generators/html-pdf.generator.js';
import { generateEpub } from '../generators/epub.generator.js';
import {
  buildUnavailableExportReview,
  finalizeExportReview,
  isBetterExportReview,
  planExportAutoFixes,
  reviewMeasuredExportLayout,
  reviewPdfExport,
} from '../services/export-review.service.js';
import fs from 'fs/promises';
import path from 'path';
import {
  getAssetStorageDir,
  getProjectAssetRelativePath,
  parseProjectAssetUrl,
} from '../../../server/src/services/asset-paths.service.js';
import {
  readProjectAssetBuffer,
  saveExportArtifact,
} from '../../../server/src/services/object-storage.service.js';
import { materializeSparsePageArt, realizeSparsePageArt } from '../../../server/src/services/layout-art.service.js';

interface ExportJobData {
  exportJobId: string;
  format: 'pdf' | 'epub' | 'print_pdf';
}

interface PdfRenderResult {
  buffer: Buffer;
  review: ExportReview;
}

interface RenderableDocument {
  id?: string | null;
  title: string;
  content: DocumentContent | null;
  sortOrder: number;
  kind?: DocumentKind | null;
  layoutPlan?: LayoutPlan | null;
  fallbackScopeIds?: string[];
}

interface MeasuredRenderableDocument extends RenderableDocument {
  pageModel: PageModel | null;
  textLayoutParity?: ExportReviewTextLayoutParityMetrics | null;
  textLayoutParityFindings?: ExportReviewFinding[];
}

interface PreflightCandidate {
  docs: RenderableDocument[];
  measuredDocs: MeasuredRenderableDocument[];
  review: ExportReview;
}

function readExportTitleFromContent(content: DocumentContent | null): string | null {
  if (!content) return null;
  if (content.type === 'titlePage') {
    const value = String(content.attrs?.title || '').trim();
    return value || null;
  }

  for (const child of content.content ?? []) {
    const nested = readExportTitleFromContent(child);
    if (nested) return nested;
  }

  return null;
}

function resolveExportProjectTitle(
  docs: Array<{ title: string; content: DocumentContent | null; sortOrder: number; kind?: DocumentKind | null }>,
  fallbackTitle: string,
): string {
  const titlePageTitle = docs
    .map((doc) => readExportTitleFromContent(doc.content))
    .find((value): value is string => Boolean(value?.trim()));

  return titlePageTitle ?? fallbackTitle;
}

export function rewriteUploadUrlsInValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const parsed = parseProjectAssetUrl(value);
    if (!parsed) return value;
    return getProjectAssetRelativePath(parsed.projectId, parsed.filename);
  }

  if (Array.isArray(value)) {
    return value.map((item) => rewriteUploadUrlsInValue(item));
  }

  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
      key,
      rewriteUploadUrlsInValue(entryValue),
    ]),
  );
}

export function rewriteUploadUrlsInDocs(
  docs: Array<{
    title: string;
    content: DocumentContent | null;
    sortOrder: number;
    kind?: DocumentKind | null;
    layoutPlan?: LayoutPlan | null;
    pageModel?: PageModel | null;
  }>,
) {
  return docs.map((doc) => ({
    ...doc,
    content: doc.content ? rewriteUploadUrlsInValue(doc.content) as DocumentContent : doc.content,
  }));
}

function getReviewFindingTitle(
  finding: ExportReview['findings'][number],
  review: ExportReview,
): string | null {
  const detailsTitle = finding.details && typeof finding.details === 'object'
    ? (finding.details as Record<string, unknown>).title
    : null;
  if (typeof detailsTitle === 'string' && detailsTitle.trim().length > 0) {
    return detailsTitle.trim();
  }

  if (typeof finding.page !== 'number' || !Number.isFinite(finding.page)) {
    return null;
  }

  const sectionStarts = [...(review.metrics.sectionStarts ?? [])]
    .filter((section) => typeof section.title === 'string' && section.title.trim().length > 0 && typeof section.page === 'number')
    .sort((left, right) => (left.page ?? Number.MAX_SAFE_INTEGER) - (right.page ?? Number.MAX_SAFE_INTEGER));

  let matchedTitle: string | null = null;
  for (const section of sectionStarts) {
    if ((section.page ?? Number.MAX_SAFE_INTEGER) <= finding.page) {
      matchedTitle = section.title.trim();
      continue;
    }
    break;
  }

  return matchedTitle;
}

function shouldGenerateSpotArtForCodes(codes: Set<string>): boolean {
  return codes.has('EXPORT_UNUSED_PAGE_REGION')
    || codes.has('EXPORT_LAST_PAGE_UNDERFILLED')
    || codes.has('EXPORT_UNBALANCED_COLUMNS')
    || codes.has('EXPORT_SPLIT_SCENE_PACKET')
    || codes.has('EXPORT_MISSED_ART_OPPORTUNITY');
}

async function measureRenderableDocs(input: {
  docs: RenderableDocument[];
  theme: string;
  pagePreset: 'standard_pdf' | 'print_pdf';
}): Promise<MeasuredRenderableDocument[]> {
  const measuredPageModels = await measureDocumentPageModels({
    documents: input.docs,
    theme: input.theme,
    pagePreset: input.pagePreset,
  });

  return input.docs.map((doc, index) => ({
    ...doc,
    pageModel: measuredPageModels[index]?.pageModel ?? null,
    textLayoutParity: measuredPageModels[index]?.textLayoutParity ?? null,
    textLayoutParityFindings: measuredPageModels[index]?.textLayoutParityFindings ?? [],
  }));
}

async function buildPreflightCandidate(input: {
  docs: RenderableDocument[];
  theme: string;
  pagePreset: 'standard_pdf' | 'print_pdf';
}): Promise<PreflightCandidate> {
  const measuredDocs = await measureRenderableDocs({
    docs: input.docs,
    theme: input.theme,
    pagePreset: input.pagePreset,
  });
  const review = reviewMeasuredExportLayout({
    documents: measuredDocs,
  });

  return {
    docs: input.docs,
    measuredDocs,
    review,
  };
}

async function applyPreflightCorrections(input: {
  candidate: PreflightCandidate;
  theme: string;
  projectId: string;
  userId: string;
  pagePreset: 'standard_pdf' | 'print_pdf';
}): Promise<PreflightCandidate | null> {
  const codesByTitle = new Map<string, Set<string>>();
  for (const finding of input.candidate.review.findings) {
    const title = getReviewFindingTitle(finding, input.candidate.review);
    if (!title) continue;
    const entry = codesByTitle.get(title) ?? new Set<string>();
    entry.add(finding.code);
    codesByTitle.set(title, entry);
  }

  if (codesByTitle.size === 0) return null;

  let changed = false;
  const nextDocs: RenderableDocument[] = [];
  for (const doc of input.candidate.docs) {
    const codes = codesByTitle.get(doc.title) ?? null;
    if (!codes || !doc.content) {
      nextDocs.push(doc);
      continue;
    }

    let nextContent = doc.content;
    let nextLayoutPlan = doc.layoutPlan ?? null;

    if (shouldGenerateSpotArtForCodes(codes)) {
      const originalContent = nextContent;
      const artAugmented = materializeSparsePageArt({
        content: nextContent,
        kind: doc.kind ?? null,
        title: doc.title,
        reviewCodes: Array.from(codes),
      });
      if (artAugmented.changed) {
        nextContent = artAugmented.content;
        changed = true;

        const realized = await realizeSparsePageArt({
          projectId: input.projectId,
          userId: input.userId,
          content: nextContent,
          insertedNodeIds: artAugmented.insertedNodeIds,
        });
        if (realized.changed) {
          nextContent = realized.content;
        } else if (hasRenderableInsertedArt(nextContent, artAugmented.insertedNodeIds)) {
          nextContent = artAugmented.content;
        } else {
          nextContent = originalContent;
        }
      }
    }

    const recommendedLayout = recommendLayoutPlan(nextContent, nextLayoutPlan, {
      documentKind: doc.kind ?? null,
      documentTitle: doc.title,
      reviewCodes: Array.from(codes),
    });

    if (JSON.stringify(recommendedLayout) !== JSON.stringify(nextLayoutPlan ?? null)) {
      nextLayoutPlan = recommendedLayout;
      changed = true;
    }

    if (JSON.stringify(nextContent) !== JSON.stringify(doc.content)) {
      changed = true;
    }

    nextDocs.push({
      ...doc,
      content: nextContent,
      layoutPlan: nextLayoutPlan,
    });
  }

  if (!changed) return null;

  return buildPreflightCandidate({
    docs: nextDocs,
    theme: input.theme,
    pagePreset: input.pagePreset,
  });
}

function hasRenderableInsertedArt(content: DocumentContent, nodeIds: string[]): boolean {
  if (nodeIds.length === 0) return false;
  const topLevel = content.content ?? [];
  const nodeIdSet = new Set(nodeIds);
  return topLevel.some((node) => {
    const attrs = node.attrs ?? {};
    if (!nodeIdSet.has(String(attrs.nodeId ?? ''))) return false;
    if (node.type !== 'fullBleedImage') return false;
    return Boolean(String(attrs.src ?? '').trim() || String(attrs.imageAssetId ?? '').trim());
  });
}

export async function createTypstWorkspace(baseDir: string): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(baseDir, 'typst-workspace-'));
  const texturesSource = path.resolve(process.cwd(), 'assets', 'textures');
  const texturesDest = path.join(workspace, 'textures');
  const uploadsSource = getAssetStorageDir();
  const uploadsDest = path.join(workspace, 'uploads');

  await fs.symlink(texturesSource, texturesDest);

  try {
    await fs.access(uploadsSource);
    await fs.symlink(uploadsSource, uploadsDest);
  } catch {
    await fs.mkdir(uploadsDest, { recursive: true });
  }

  return workspace;
}

/**
 * Process an export job from the BullMQ queue.
 *
 * Steps:
 *  1. Mark the export job as "processing" in the database
 *  2. Fetch the project and its documents
 *  3. For PDF: assemble Typst source and compile via Typst NAPI compiler
 *     For EPUB: assemble HTML and convert via Pandoc
 *  5. Write the output file to local storage
 *  6. Update the export job record with the output URL
 *
 * On failure the export job status is set to "failed" with the error message.
 */
export async function processExportJob(job: Job<ExportJobData>): Promise<void> {
  const { exportJobId, format } = job.data;

  // Mark the export job as processing
  await prisma.exportJob.update({
    where: { id: exportJobId },
    data: { status: 'processing' },
  });

  try {
    // Fetch export job with project
    const exportJob = await prisma.exportJob.findUnique({
      where: { id: exportJobId },
      include: { project: true },
    });

    if (!exportJob) {
      throw new Error(`Export job not found: ${exportJobId}`);
    }

    await job.updateProgress(20);

    const theme = (exportJob.project.settings as Record<string, unknown>)?.theme as string || 'classic-parchment';

    // Use per-chapter ProjectDocuments when available, fall back to monolithic Project.content
    const projectDocuments = await prisma.projectDocument.findMany({
      where: { projectId: exportJob.projectId },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, title: true, content: true, sortOrder: true, kind: true, layoutPlan: true },
    });

    const rawDocs = projectDocuments.length > 0
      ? projectDocuments.map(doc => ({
          id: doc.id,
          title: doc.title,
          content: doc.content as DocumentContent | null,
          sortOrder: doc.sortOrder,
          kind: doc.kind as DocumentKind,
          layoutPlan: doc.layoutPlan as LayoutPlan | null,
          fallbackScopeIds: resolveTextLayoutFallbackScopeIds(exportJob.project.settings, doc.id),
        }))
      : [{
          title: exportJob.project.title,
          content: exportJob.project.content as DocumentContent | null,
          sortOrder: 0,
        }];

    const docs = normalizeExportDocuments(rawDocs, exportJob.project.title, {
      projectType: exportJob.project.type,
    });
    const exportTitle = resolveExportProjectTitle(docs, exportJob.project.title);

    await job.updateProgress(50);

    // Generate output based on requested format
    let buffer: Buffer;
    let review: ExportReview | null = null;
    if (format === 'pdf' || format === 'print_pdf') {
      // Typst pipeline for PDF
      const outputDir = path.join(process.cwd(), 'output');
      await fs.mkdir(outputDir, { recursive: true });

      const ext = 'pdf';
      const filename = `${exportJob.projectId}-${Date.now()}.${ext}`;
      const filepath = path.join(outputDir, filename);

      const baseRender = await renderPdfVariant({
        filepath,
        docs,
        theme,
        projectTitle: exportTitle,
        projectId: exportJob.projectId,
        userId: exportJob.userId,
        projectType: exportJob.project.type,
        printReady: format === 'print_pdf',
      });

      let selected = baseRender;
      const autoFixes = planExportAutoFixes(baseRender.review);

      if (autoFixes.length > 0) {
        const polishedFilepath = filepath.replace(/\.pdf$/, '.polished.pdf');
        const polishedRender = await renderPdfVariant({
          filepath: polishedFilepath,
          docs,
          theme,
          projectTitle: exportTitle,
          projectId: exportJob.projectId,
          userId: exportJob.userId,
          projectType: exportJob.project.type,
          printReady: format === 'print_pdf',
          autoFixes,
          reviewCodes: baseRender.review.findings.map((finding) => finding.code),
        });

        if (isBetterExportReview(polishedRender.review, baseRender.review)) {
          await fs.rename(polishedFilepath, filepath);
          selected = {
            buffer: polishedRender.buffer,
            review: finalizeExportReview(polishedRender.review, autoFixes, 2),
          };
        } else {
          await fs.rm(polishedFilepath, { force: true });
          selected = {
            buffer: baseRender.buffer,
            review: finalizeExportReview(baseRender.review, [], 1),
          };
        }
      } else {
        selected = {
          buffer: baseRender.buffer,
          review: finalizeExportReview(baseRender.review, [], 1),
        };
      }

      buffer = selected.buffer;
      review = selected.review;

      await job.updateProgress(80);

      const outputUrl = await saveExportArtifact({
        filename,
        buffer,
        contentType: 'application/pdf',
      });

      // Update export job with success
      await prisma.exportJob.update({
        where: { id: exportJobId },
        data: {
          status: 'completed',
          progress: 100,
          outputUrl,
          reviewJson: review as any,
          completedAt: new Date(),
        },
      });

      await job.updateProgress(100);

      console.log(`[export.job] Export ${exportJobId} completed -> ${filepath}`);
      return;
    } else if (format === 'epub') {
      // HTML + Pandoc pipeline for EPUB
      const html = assembleHtml({
        documents: docs,
        theme,
        projectTitle: exportTitle,
        pagePreset: 'epub',
      });
      const serverBaseUrl = process.env.SERVER_BASE_URL || 'http://localhost:4000';
      const resolvedHtml = rewritePublicAssetUrls(html, serverBaseUrl);
      buffer = await generateEpub(resolvedHtml, exportJob.project.title);
    } else {
      throw new Error(`Unsupported export format: ${format}`);
    }

    await job.updateProgress(80);

    const ext = format === 'epub' ? 'epub' : 'pdf';
    const filename = `${exportJob.projectId}-${Date.now()}.${ext}`;
    const outputUrl = await saveExportArtifact({
      filename,
      buffer,
      contentType: format === 'epub' ? 'application/epub+zip' : 'application/pdf',
    });

    // Update export job with success
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'completed',
        progress: 100,
        outputUrl,
        completedAt: new Date(),
      },
    });

    await job.updateProgress(100);

    console.log(`[export.job] Export ${exportJobId} completed -> ${outputUrl}`);
  } catch (error: unknown) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);

    // Update export job with failure
    try {
      await prisma.exportJob.update({
        where: { id: exportJobId },
        data: {
          status: 'failed',
          errorMessage: message,
        },
      });
    } catch (dbErr) {
      console.error(`[export.job] Failed to update job status to failed:`, dbErr);
    }

    console.error(`[export.job] Export ${exportJobId} failed:`, message);
    throw error;
  }
}

async function renderPdfVariant(input: {
  filepath: string;
  docs: RenderableDocument[];
  theme: string;
  projectTitle: string;
  projectId: string;
  userId: string;
  projectType?: string | null;
  printReady: boolean;
  autoFixes?: ExportReviewAutoFix[];
  reviewCodes?: string[];
}): Promise<PdfRenderResult> {
  const {
    filepath,
    docs,
    theme,
    projectTitle,
    projectId,
    userId,
    projectType = null,
    printReady,
    autoFixes = [],
    reviewCodes = [],
  } = input;
  const pagePreset = printReady ? 'print_pdf' : 'standard_pdf';
  const renderDocs = autoFixes.includes('refresh_layout_plan')
    ? docs.map((doc) => ({
        ...doc,
        layoutPlan: doc.content
          ? recommendLayoutPlan(doc.content, doc.layoutPlan ?? null, {
              documentKind: doc.kind ?? null,
              documentTitle: doc.title,
              reviewCodes,
              isShortBook: projectType === 'one_shot',
            })
          : doc.layoutPlan ?? null,
      }))
    : docs;
  const baseCandidate = await buildPreflightCandidate({
    docs: renderDocs,
    theme,
    pagePreset,
  });
  const correctedCandidate = await applyPreflightCorrections({
    candidate: baseCandidate,
    theme,
    projectId,
    userId,
    pagePreset,
  });
  const selectedCandidate = correctedCandidate && isBetterExportReview(correctedCandidate.review, baseCandidate.review)
    ? correctedCandidate
    : baseCandidate;

  const html = assembleHtml({
    documents: selectedCandidate.measuredDocs,
    theme,
    projectTitle,
    pagePreset,
    renderMode: 'paged',
  });
  const resolvedHtml = await rewriteUploadUrlsToEmbeddedDataUrls(html);
  const buffer = await generateHtmlPdf({
    html: resolvedHtml,
    title: projectTitle,
  });
  await fs.writeFile(filepath, buffer);

  try {
    const reviewedDocs = selectedCandidate.measuredDocs.map((doc) => ({
      title: doc.title,
      kind: doc.kind ?? null,
      content: doc.content,
      pageModel: doc.pageModel ?? null,
      layoutPlan: doc.content
        ? resolveLayoutPlan(doc.content, doc.layoutPlan ?? null, {
            documentKind: doc.kind ?? null,
            documentTitle: doc.title,
          }).layoutPlan
        : doc.layoutPlan ?? null,
    }));
    const review = await reviewPdfExport(
      filepath,
      reviewedDocs,
    );
    return { buffer, review };
  } catch (reviewError) {
    const message = reviewError instanceof Error ? reviewError.message : String(reviewError);
    console.error(`[export.job] Export review failed for ${path.basename(filepath)}:`, message);
    return {
      buffer,
      review: buildUnavailableExportReview(`Export review failed: ${message}`),
    };
  }
}

function rewritePublicAssetUrls(html: string, baseUrl: string): string {
  return html
    .replace(/(src|href)="(\/uploads\/[^"]+)"/g, (_match, attribute, relativePath) => {
      return `${attribute}="${baseUrl}${relativePath}"`;
    })
    .replace(/url\((['"]?)(\/uploads\/[^'")]+)\1\)/g, (_match, quote, relativePath) => {
      const nextQuote = quote || '"';
      return `url(${nextQuote}${baseUrl}${relativePath}${nextQuote})`;
    });
}

function getAssetMimeType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  switch (extension) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.webp':
      return 'image/webp';
    case '.png':
    default:
      return 'image/png';
  }
}

async function rewriteUploadUrlsToEmbeddedDataUrls(html: string): Promise<string> {
  const matches = html.match(/\/uploads\/[^"'()\s]+/g);
  if (!matches || matches.length === 0) return html;

  let nextHtml = html;
  const uniquePaths = [...new Set(matches)];
  for (const relativePath of uniquePaths) {
    const parsed = parseProjectAssetUrl(relativePath);
    if (!parsed) continue;

    try {
      const fileBuffer = await readProjectAssetBuffer(relativePath);
      const mimeType = getAssetMimeType(parsed.filename);
      const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      nextHtml = nextHtml.split(relativePath).join(dataUrl);
    } catch (error) {
      console.warn(`[export.job] Failed to inline asset ${relativePath}:`, error);
    }
  }

  return nextHtml;
}
