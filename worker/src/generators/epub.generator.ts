import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

/**
 * Generate an ePub file from an HTML string using the Pandoc CLI.
 *
 * The function writes the HTML to a temporary file, invokes Pandoc to
 * convert it into an ePub with embedded resources, reads the resulting
 * binary, and cleans up the temp directory before returning the Buffer.
 *
 * If Pandoc is not installed on the system the error is re-thrown with
 * a human-readable message so the caller can surface it to the user.
 */
export async function generateEpub(html: string, title: string): Promise<Buffer> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dnd-epub-'));
  const inputPath = path.join(tmpDir, 'input.html');
  const outputPath = path.join(tmpDir, 'output.epub');

  // Sanitize title: strip control chars, limit length, remove null bytes
  const safeTitle = title
    .replace(/[\x00-\x1f\x7f]/g, '') // strip control characters
    .replace(/\0/g, '')               // strip null bytes
    .slice(0, 200)                     // limit length
    || 'Untitled';

  try {
    await fs.writeFile(inputPath, html, 'utf-8');

    await execFileAsync('pandoc', [
      inputPath,
      '-o', outputPath,
      '--metadata', `title=${safeTitle}`,
      '--embed-resources',
    ]);

    return await fs.readFile(outputPath);
  } catch (error: unknown) {
    // Provide a clear message when Pandoc is not installed
    if (
      error instanceof Error &&
      'code' in error &&
      (error as NodeJS.ErrnoException).code === 'ENOENT'
    ) {
      throw new Error(
        'Pandoc is not installed or not found on PATH. ' +
        'Install Pandoc (https://pandoc.org/installing.html) to enable ePub export.',
      );
    }
    throw error;
  } finally {
    // Clean up temp files regardless of success or failure
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
