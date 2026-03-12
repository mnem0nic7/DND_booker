import type { Job } from 'bullmq';
import type {
  DocumentContent,
  DocumentKind,
  ExportReview,
  ExportReviewAutoFix,
} from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { assembleHtml } from '../renderers/html-assembler.js';
import { assembleTypst } from '../renderers/typst-assembler.js';
import { normalizeExportDocuments } from '../renderers/export-document-normalizer.js';
import { generateTypstPdf } from '../generators/typst.generator.js';
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
  docs: Array<{ title: string; content: DocumentContent | null; sortOrder: number; kind?: DocumentKind | null }>,
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
      select: { title: true, content: true, sortOrder: true, kind: true },
    });

    const rawDocs = projectDocuments.length > 0
      ? projectDocuments.map(doc => ({
          title: doc.title,
          content: doc.content as DocumentContent | null,
          sortOrder: doc.sortOrder,
          kind: doc.kind as DocumentKind,
        }))
      : [{
          title: exportJob.project.title,
          content: exportJob.project.content as DocumentContent | null,
          sortOrder: 0,
        }];

    const docs = normalizeExportDocuments(rawDocs, exportJob.project.title);

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
        projectTitle: exportJob.project.title,
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
          projectTitle: exportJob.project.title,
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
        projectTitle: exportJob.project.title,
      });
      const serverBaseUrl = process.env.SERVER_BASE_URL || 'http://localhost:4000';
      const resolvedHtml = html.replace(/(?:src|href)="(\/uploads\/[^"]+)"/g, (_match, p1) => {
        return `src="${serverBaseUrl}${p1}"`;
      });
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
  docs: Array<{ title: string; content: DocumentContent | null; sortOrder: number; kind?: DocumentKind | null }>;
  theme: string;
  projectTitle: string;
  printReady: boolean;
  autoFixes?: ExportReviewAutoFix[];
}): Promise<PdfRenderResult> {
  const { filepath, docs, theme, projectTitle, printReady, autoFixes = [] } = input;
  const assetsDir = path.resolve(process.cwd(), 'assets');
  const fontsDir = path.join(assetsDir, 'fonts');
  const outputDir = path.dirname(filepath);
  const typstWorkspace = await createTypstWorkspace(outputDir);
  const rewrittenDocs = rewriteUploadUrlsInDocs(docs);

  try {
    const typstSource = assembleTypst({
      documents: rewrittenDocs,
      theme,
      projectTitle,
      printReady,
      exportPolish: {
        h1SizePt: autoFixes.includes('shrink_h1_headings') ? 21 : undefined,
        endCapMode: autoFixes.includes('dedicated_end_page') ? 'full_page' : 'inline',
        chapterOpenerMode: autoFixes.includes('dedicated_chapter_openers') ? 'dedicated_page' : 'inline',
      },
    });

    const buffer = await generateTypstPdf(typstSource, [fontsDir], typstWorkspace);
    await fs.writeFile(filepath, buffer);

    try {
      const review = await reviewPdfExport(
        filepath,
        docs.map((doc) => ({
          title: doc.title,
          kind: doc.kind ?? null,
          content: doc.content,
        }))
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
  } finally {
    await fs.rm(typstWorkspace, { recursive: true, force: true });
  }
}
