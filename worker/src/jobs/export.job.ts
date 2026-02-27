import type { Job } from 'bullmq';
import type { DocumentContent } from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { assembleHtml } from '../renderers/html-assembler.js';
import { generatePdf } from '../generators/pdf.generator.js';
import { generatePrintPdf } from '../generators/print-pdf.generator.js';
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
 *  3. Assemble full HTML from all documents using the project theme
 *  4. Generate a PDF (standard or print-ready) via Puppeteer
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
    // Fetch export job with full project and documents
    const exportJob = await prisma.exportJob.findUnique({
      where: { id: exportJobId },
      include: {
        project: {
          include: {
            documents: { orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });

    if (!exportJob) {
      throw new Error(`Export job not found: ${exportJobId}`);
    }

    await job.updateProgress(20);

    // Assemble HTML from all documents
    const html = assembleHtml({
      documents: exportJob.project.documents.map((d) => ({
        title: d.title,
        content: d.content as DocumentContent | null,
        sortOrder: d.sortOrder,
      })),
      theme: (exportJob.project.settings as Record<string, unknown>)?.theme as string || 'classic-parchment',
      projectTitle: exportJob.project.title,
    });

    await job.updateProgress(50);

    // Generate output based on requested format
    let buffer: Buffer;
    if (format === 'pdf') {
      buffer = await generatePdf(html);
    } else if (format === 'print_pdf') {
      buffer = await generatePrintPdf(html);
    } else if (format === 'epub') {
      buffer = await generateEpub(html, exportJob.project.title);
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
    const message = error instanceof Error ? error.message : String(error);

    // Update export job with failure
    await prisma.exportJob.update({
      where: { id: exportJobId },
      data: {
        status: 'failed',
        errorMessage: message,
      },
    });

    console.error(`[export.job] Export ${exportJobId} failed:`, message);
    throw error;
  }
}
