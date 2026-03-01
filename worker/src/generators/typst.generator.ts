/**
 * Generate a PDF from a Typst source string using the NAPI-based
 * typst-ts-node-compiler. This avoids shelling out to a Typst CLI
 * binary and keeps the compilation in-process for speed.
 */

import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import path from 'path';

const ASSETS_DIR = path.resolve(process.cwd(), 'assets');
const FONTS_DIR = path.join(ASSETS_DIR, 'fonts');

export async function generateTypstPdf(
  typstSource: string,
  fontPaths?: string[],
  workspaceRoot?: string,
): Promise<Buffer> {
  const compiler = NodeCompiler.create({
    workspace: workspaceRoot || ASSETS_DIR,
    fontArgs: [{ fontPaths: fontPaths || [FONTS_DIR] }],
  });
  try {
    const pdf = compiler.pdf({ mainFileContent: typstSource });
    if (!pdf || pdf.length === 0) {
      throw new Error('Typst compilation produced empty output');
    }
    return Buffer.from(pdf);
  } finally {
    compiler.evictCache(0);
  }
}
