import type { Job } from 'bullmq';
import type { DocumentContent } from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { assembleHtml } from '../renderers/html-assembler.js';
import { assembleTypst } from '../renderers/typst-assembler.js';
import { generateTypstPdf } from '../generators/typst.generator.js';
import { generateEpub } from '../generators/epub.generator.js';
import fs from 'fs/promises';
import path from 'path';

interface ExportJobData {
  exportJobId: string;
  format: 'pdf' | 'epub' | 'print_pdf';
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
    // Single-element docs array for backward compatibility with assemblers
    const docs = [{
      title: exportJob.project.title,
      content: exportJob.project.content as DocumentContent | null,
      sortOrder: 0,
    }];

    await job.updateProgress(50);

    // Generate output based on requested format
    let buffer: Buffer;
    if (format === 'pdf' || format === 'print_pdf') {
      // Typst pipeline for PDF
      const typstSource = assembleTypst({
        documents: docs,
        theme,
        projectTitle: exportJob.project.title,
        printReady: format === 'print_pdf',
      });

      const assetsDir = path.resolve(process.cwd(), 'assets');
      const fontsDir = path.join(assetsDir, 'fonts');
      buffer = await generateTypstPdf(typstSource, [fontsDir], assetsDir);
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
