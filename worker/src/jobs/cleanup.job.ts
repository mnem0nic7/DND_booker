import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../config/database.js';

const OUTPUT_DIR = path.join(process.cwd(), 'output');
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Clean up old export output files and null out their database URLs.
 * Runs on a schedule to prevent unbounded disk growth.
 */
export async function cleanupExportFiles(): Promise<void> {
  const cutoff = new Date(Date.now() - MAX_AGE_MS);

  // Find completed exports older than the cutoff that still have output files
  const staleJobs = await prisma.exportJob.findMany({
    where: {
      status: 'completed',
      completedAt: { lt: cutoff },
      outputUrl: { not: null },
    },
    select: { id: true, outputUrl: true },
  });

  if (staleJobs.length === 0) return;

  let deleted = 0;
  for (const job of staleJobs) {
    if (!job.outputUrl) continue;

    // Delete the file from disk
    const filename = path.basename(job.outputUrl);
    const filePath = path.join(OUTPUT_DIR, filename);
    try {
      await fs.unlink(filePath);
      deleted++;
    } catch (err: unknown) {
      if (err instanceof Error && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.error(`[cleanup] Failed to delete ${filePath}:`, (err as Error).message);
      }
    }

    // Null out the URL so the download link stops working
    await prisma.exportJob.update({
      where: { id: job.id },
      data: { outputUrl: null },
    });
  }

  if (deleted > 0) {
    console.log(`[cleanup] Removed ${deleted} expired export files (${staleJobs.length} jobs updated)`);
  }
}
