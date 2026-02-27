import type { Job } from 'bullmq';

interface ExportJobData {
  exportJobId: string;
  format: 'pdf' | 'epub' | 'print_pdf';
}

/**
 * Process an export job from the BullMQ queue.
 * This is a stub — Task 20 fills in the full Puppeteer-based implementation.
 */
export async function processExportJob(job: Job<ExportJobData>): Promise<void> {
  const { exportJobId, format } = job.data;

  console.log(`[export.job] Processing export job ${exportJobId} (format: ${format})`);
  console.log(`[export.job] Job ${job.id} — stub implementation, no PDF generated yet.`);

  // TODO (Task 20): Full implementation with:
  // 1. Fetch project documents from database
  // 2. Assemble HTML via html-assembler
  // 3. Render PDF via Puppeteer
  // 4. Upload to storage
  // 5. Update export job status in database
}
