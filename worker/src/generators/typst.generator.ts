/**
 * Generate a PDF from a Typst source string using the NAPI-based
 * typst-ts-node-compiler. This avoids shelling out to a Typst CLI
 * binary and keeps the compilation in-process for speed.
 */

import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import path from 'path';

const ASSETS_DIR = path.resolve(process.cwd(), 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');
const TYPST_PACKAGES_DIR = path.join(ASSETS_DIR, 'typst', 'packages');

export async function generateTypstPdf(
  typstSource: string,
  fontPaths?: string[],
  workspaceRoot?: string,
): Promise<Buffer> {
  const previousPackagePath = process.env.TYPST_PACKAGE_PATH;
  process.env.TYPST_PACKAGE_PATH = TYPST_PACKAGES_DIR;
  const compiler = NodeCompiler.create({
    workspace: workspaceRoot || ASSETS_DIR,
    fontArgs: [{ fontPaths: fontPaths || [FONTS_DIR] }],
  });
  try {
    let pdf: Uint8Array | undefined;
    try {
      pdf = compiler.pdf({ mainFileContent: typstSource });
    } catch (error) {
      const message = error instanceof Error ? error.message.trim() : String(error ?? '').trim();
      throw new Error(message || 'Typst compilation failed.');
    }
    if (!pdf || pdf.length === 0) {
      throw new Error('Typst compilation produced empty output');
    }
    return Buffer.from(pdf);
  } finally {
    compiler.evictCache(0);
    if (previousPackagePath) {
      process.env.TYPST_PACKAGE_PATH = previousPackagePath;
    } else {
      delete process.env.TYPST_PACKAGE_PATH;
    }
  }
}
