import type { Job } from 'bullmq';
import type {
  DocumentContent,
  DocumentKind,
  ExportReview,
  ExportReviewAutoFix,
  LayoutPlan,
} from '@dnd-booker/shared';
import { resolveLayoutPlan } from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { assembleHtml } from '../renderers/html-assembler.js';
import { normalizeExportDocuments } from '../renderers/export-document-normalizer.js';
import { generateHtmlPdf } from '../generators/html-pdf.generator.js';
import { generateEpub } from '../generators/epub.generator.js';
import {
  buildUnavailableExportReview,
  finalizeExportReview,
  isBetterExportReview,
  planExportAutoFixes,
  reviewPdfExport,
} from '../services/export-review.service.js';
import fs from 'fs/promises';
import path from 'path';
import {
  getAssetStorageDir,
  getProjectAssetRelativePath,
  parseProjectAssetUrl,
} from '../../../server/src/services/asset-paths.service.js';

interface ExportJobData {
  exportJobId: string;
  format: 'pdf' | 'epub' | 'print_pdf';
}

interface PdfRenderResult {
  buffer: Buffer;
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
  }>,
) {
  return docs.map((doc) => ({
    ...doc,
    content: doc.content ? rewriteUploadUrlsInValue(doc.content) as DocumentContent : doc.content,
  }));
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
      select: { title: true, content: true, sortOrder: true, kind: true, layoutPlan: true },
    });

    const rawDocs = projectDocuments.length > 0
      ? projectDocuments.map(doc => ({
          title: doc.title,
          content: doc.content as DocumentContent | null,
          sortOrder: doc.sortOrder,
          kind: doc.kind as DocumentKind,
          layoutPlan: doc.layoutPlan as LayoutPlan | null,
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
          projectType: exportJob.project.type,
          printReady: format === 'print_pdf',
          autoFixes,
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

      // Update export job with success
      await prisma.exportJob.update({
        where: { id: exportJobId },
        data: {
          status: 'completed',
          progress: 100,
          outputUrl: `/output/${filename}`,
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

    // Save to local storage (replace with S3 in production)
    const outputDir = path.join(process.cwd(), 'output');
    await fs.mkdir(outputDir, { recursive: true });

    const ext = format === 'epub' ? 'epub' : 'pdf';
    const filename = `${exportJob.projectId}-${Date.now()}.${ext}`;
    const filepath = path.join(outputDir, filename);
    await fs.writeFile(filepath, buffer);

    // Update export job with success
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'completed',
        progress: 100,
        outputUrl: `/output/${filename}`,
        completedAt: new Date(),
      },
    });

    await job.updateProgress(100);

    console.log(`[export.job] Export ${exportJobId} completed -> ${filepath}`);
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
  docs: Array<{
    title: string;
    content: DocumentContent | null;
    sortOrder: number;
    kind?: DocumentKind | null;
    layoutPlan?: LayoutPlan | null;
  }>;
  theme: string;
  projectTitle: string;
  projectType?: string | null;
  printReady: boolean;
  autoFixes?: ExportReviewAutoFix[];
}): Promise<PdfRenderResult> {
  const { filepath, docs, theme, projectTitle, projectType = null, printReady, autoFixes = [] } = input;
  const renderDocs = autoFixes.includes('refresh_layout_plan')
    ? docs.map((doc) => ({ ...doc, layoutPlan: null }))
    : docs;
  const html = assembleHtml({
    documents: renderDocs,
    theme,
    projectTitle,
    pagePreset: printReady ? 'print_pdf' : 'standard_pdf',
  });
  const resolvedHtml = await rewriteUploadUrlsToEmbeddedDataUrls(html);
  const buffer = await generateHtmlPdf({
    html: resolvedHtml,
    title: projectTitle,
  });
  await fs.writeFile(filepath, buffer);

  try {
    const reviewedDocs = renderDocs.map((doc) => ({
      title: doc.title,
      kind: doc.kind ?? null,
      content: doc.content,
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
  const uploadsRoot = getAssetStorageDir();
  const matches = html.match(/\/uploads\/[^"'()\s]+/g);
  if (!matches || matches.length === 0) return html;

  let nextHtml = html;
  const uniquePaths = [...new Set(matches)];
  for (const relativePath of uniquePaths) {
    const parsed = parseProjectAssetUrl(relativePath);
    if (!parsed) continue;

    const absolutePath = path.join(uploadsRoot, parsed.projectId, parsed.filename);
    try {
      const fileBuffer = await fs.readFile(absolutePath);
      const mimeType = getAssetMimeType(parsed.filename);
      const dataUrl = `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
      nextHtml = nextHtml.split(relativePath).join(dataUrl);
    } catch (error) {
      console.warn(`[export.job] Failed to inline asset ${relativePath}:`, error);
    }
  }

  return nextHtml;
}
