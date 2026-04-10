import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { NodeCompiler } from '@myriaddreamin/typst-ts-node-compiler';
import { chromium } from 'playwright-core';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { resolveLayoutPlan, type DocumentContent } from '@dnd-booker/shared';
import { measureDocumentPageModels } from '../generators/html-pdf.generator.js';
import { assembleHtml } from '../renderers/html-assembler.js';
import { assembleTypst } from '../renderers/typst-assembler.js';

const execFileAsync = promisify(execFile);
const FIXTURE_TITLE = 'Underdark Afterdark Visual Parity';
const FIXTURE_THEME = 'gilded-folio';
const GRID_ROWS = 10;
const GRID_COLS = 8;
const MAX_HEATMAP_DRIFT = 0.085;
const MIN_PREVIEW_TOP_RIGHT_DENSITY = 0.04;
const MIN_EXPORT_TOP_MID_DENSITY = 0.04;
const DEFAULT_EXECUTABLE_PATHS = [
  process.env.CHROMIUM_PATH,
  process.env.GOOGLE_CHROME_BIN,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  process.env.HOME ? path.join(process.env.HOME, '.local/bin/google-chrome-stable') : null,
].filter((value): value is string => Boolean(value));

function resolveChromiumExecutablePath(): string {
  return DEFAULT_EXECUTABLE_PATHS.find((candidate) => existsSync(candidate)) ?? DEFAULT_EXECUTABLE_PATHS[0] ?? '/usr/bin/chromium';
}

function text(value: string): DocumentContent {
  return { type: 'text', text: value };
}

function paragraph(value: string): DocumentContent {
  return {
    type: 'paragraph',
    content: [text(value)],
  };
}

function heading(level: number, value: string): DocumentContent {
  return {
    type: 'heading',
    attrs: { level },
    content: [text(value)],
  };
}

function sidebarCallout(title: string, body: string): DocumentContent {
  return {
    type: 'sidebarCallout',
    attrs: {
      title,
      calloutType: 'tip',
    },
    content: [paragraph(body)],
  };
}

function magicItem(name: string, description: string): DocumentContent {
  return {
    type: 'magicItem',
    attrs: {
      name,
      type: 'wondrous item',
      rarity: 'rare',
      description,
    },
  };
}

function buildFixtureDocument(): DocumentContent {
  return {
    type: 'doc',
    content: [
      heading(2, 'A Souvenir of a Dead Future'),
      paragraph('As the party gathers their gear from the scorched foundation of the workshop, they notice something shimmering in the dirt. It is a piece of Master Geargrind’s ambition that refused to be erased, a relic from the aborted timeline where his machine succeeded.'),
      sidebarCallout(
        'DM Tip: The Weight of Memory',
        'Because the demiplane was a future that never happened, the people of Oakhaven will not recognize the party as the saviors of their reality. You might choose to have the NPCs offer a modest reward for checking on the old man, unaware that the party literally saved their existence.',
      ),
      paragraph('If the group lingers here, let the recovered memory of the place bend the scene back toward the present. Lantern soot settles in reverse, singed paperwork reassembles for a breath, and the ruined gears hum with a rhythm that sounds almost like applause before it fades again.'),
      heading(2, 'The Inventor’s Legacy'),
      paragraph('Of Master Geargrind himself, there is no sign. Whether he was consumed by the core, cast into a distant corner of the multiverse, or simply unwritten along with his workshop remains a mystery that the characters can carry into whatever comes next.'),
      magicItem(
        'Echo of the Unwritten Age',
        'This heavy brass pocket watch feels warmer than it should. Its face is a chaotic swirl of constellations that do not match any known sky, and it has four hands that move at different impossible speeds. While attuned to this watch, you gain a +2 bonus to Initiative rolls and can use an action to cast the Shield spell without expending a spell slot once per dawn.',
      ),
      paragraph('The watch is not just treasure. It is proof that history tried to become something stranger, and that the party was standing at the exact hinge where the impossible almost became permanent.'),
    ],
  };
}

type DensityGrid = {
  densities: number[];
  rows: number;
  cols: number;
};

function sampleBackground(png: PNG): { r: number; g: number; b: number } {
  const sampleSize = Math.max(8, Math.floor(Math.min(png.width, png.height) * 0.05));
  const boxes = [
    { startX: 0, startY: 0 },
    { startX: png.width - sampleSize, startY: 0 },
    { startX: 0, startY: png.height - sampleSize },
    { startX: png.width - sampleSize, startY: png.height - sampleSize },
  ];

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (const box of boxes) {
    for (let y = box.startY; y < box.startY + sampleSize; y += 1) {
      for (let x = box.startX; x < box.startX + sampleSize; x += 1) {
        const index = (png.width * y + x) * 4;
        const alpha = png.data[index + 3] ?? 255;
        if (alpha < 24) continue;
        r += png.data[index] ?? 0;
        g += png.data[index + 1] ?? 0;
        b += png.data[index + 2] ?? 0;
        count += 1;
      }
    }
  }

  if (count === 0) {
    return { r: 255, g: 255, b: 255 };
  }

  return {
    r: r / count,
    g: g / count,
    b: b / count,
  };
}

function buildDensityGrid(buffer: Buffer, rows = GRID_ROWS, cols = GRID_COLS): DensityGrid {
  const png = PNG.sync.read(buffer);
  const background = sampleBackground(png);
  const inkCounts = new Array(rows * cols).fill(0);
  const pixelCounts = new Array(rows * cols).fill(0);

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const index = (png.width * y + x) * 4;
      const alpha = png.data[index + 3] ?? 255;
      const cellX = Math.min(cols - 1, Math.floor((x / png.width) * cols));
      const cellY = Math.min(rows - 1, Math.floor((y / png.height) * rows));
      const cellIndex = cellY * cols + cellX;
      pixelCounts[cellIndex] += 1;

      if (alpha < 24) continue;

      const diff = (
        Math.abs((png.data[index] ?? 0) - background.r)
        + Math.abs((png.data[index + 1] ?? 0) - background.g)
        + Math.abs((png.data[index + 2] ?? 0) - background.b)
      ) / 3;

      if (diff >= 26) {
        inkCounts[cellIndex] += 1;
      }
    }
  }

  return {
    rows,
    cols,
    densities: inkCounts.map((ink, index) => ink / Math.max(1, pixelCounts[index])),
  };
}

function meanAbsoluteDifference(left: number[], right: number[]): number {
  return left.reduce((total, value, index) => total + Math.abs(value - (right[index] ?? 0)), 0) / Math.max(1, left.length);
}

function quadrantDensity(grid: DensityGrid, rowStart: number, rowEnd: number, colStart: number, colEnd: number): number {
  let total = 0;
  let count = 0;
  for (let row = rowStart; row < rowEnd; row += 1) {
    for (let col = colStart; col < colEnd; col += 1) {
      total += grid.densities[row * grid.cols + col] ?? 0;
      count += 1;
    }
  }
  return total / Math.max(1, count);
}

async function screenshotPreviewFirstPage(content: DocumentContent): Promise<Buffer> {
  const resolved = resolveLayoutPlan(content, null, {
    documentKind: 'chapter',
    documentTitle: FIXTURE_TITLE,
  });
  const layoutPlan = resolved.layoutPlan;
  const [measured] = await measureDocumentPageModels({
    documents: [{
      id: 'underdark-afterdark-preview-fixture',
      title: FIXTURE_TITLE,
      content,
      kind: 'chapter',
      sortOrder: 1,
      layoutPlan,
    }],
    theme: FIXTURE_THEME,
    pagePreset: 'editor_preview',
  });
  if (!measured?.pageModel) {
    throw new Error('Failed to build preview page model for visual parity fixture.');
  }

  const html = assembleHtml({
    documents: [{
      title: FIXTURE_TITLE,
      content,
      kind: 'chapter',
      sortOrder: 1,
      layoutPlan,
      pageModel: measured.pageModel,
    }],
    theme: FIXTURE_THEME,
    projectTitle: FIXTURE_TITLE,
    pagePreset: 'editor_preview',
    renderMode: 'paged',
  });

  const browser = await chromium.launch({
    executablePath: resolveChromiumExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1200, height: 1400 },
      deviceScaleFactor: 1,
    });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => {
      if ('fonts' in document) {
        await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
      }
    });
    await page.waitForTimeout(150);
    return Buffer.from(await page.locator('.page-canvas').first().screenshot({ type: 'png' }));
  } finally {
    await browser.close();
  }
}

async function screenshotExportFirstPage(content: DocumentContent): Promise<Buffer> {
  const resolved = resolveLayoutPlan(content, null, {
    documentKind: 'chapter',
    documentTitle: FIXTURE_TITLE,
  });
  const layoutPlan = resolved.layoutPlan;
  const typstSource = assembleTypst({
    documents: [{
      title: FIXTURE_TITLE,
      content,
      kind: 'chapter',
      sortOrder: 1,
      layoutPlan,
    }],
    theme: FIXTURE_THEME,
    projectTitle: FIXTURE_TITLE,
    projectType: 'one_shot',
  });

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dnd-booker-layout-visual-'));
  const assetsRoot = path.resolve(process.cwd(), 'assets/typst');
  const fontsRoot = path.resolve(process.cwd(), 'assets/fonts');
  const texturesRoot = path.resolve(process.cwd(), 'assets/textures');
  const pdfPath = path.join(tempDir, 'fixture.pdf');
  const pngStem = path.join(tempDir, 'fixture-page');
  const typstLinkPath = path.join(tempDir, 'typst');
  const texturesLinkPath = path.join(tempDir, 'textures');
  const previousPackagePath = process.env.TYPST_PACKAGE_PATH;

  try {
    await fs.symlink(assetsRoot, typstLinkPath, 'dir');
    await fs.symlink(texturesRoot, texturesLinkPath, 'dir');
    process.env.TYPST_PACKAGE_PATH = path.join(assetsRoot, 'packages');
    const compiler = NodeCompiler.create({
      workspace: tempDir,
      fontArgs: [{ fontPaths: [fontsRoot] }],
    });

    try {
      const pdf = compiler.pdf({ mainFileContent: typstSource });
      expect(pdf).toBeDefined();
      await fs.writeFile(pdfPath, Buffer.from(pdf!));
    } finally {
      compiler.evictCache(0);
    }

    await execFileAsync('pdftoppm', ['-f', '1', '-singlefile', '-png', pdfPath, pngStem]);
    return await fs.readFile(`${pngStem}.png`);
  } finally {
    if (previousPackagePath) {
      process.env.TYPST_PACKAGE_PATH = previousPackagePath;
    } else {
      delete process.env.TYPST_PACKAGE_PATH;
    }
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

describe('Layout Visual Parity', () => {
  it('keeps preview and export visually balanced for wrap-heavy chapter fixtures', async () => {
    const fixture = buildFixtureDocument();
    const previewPng = await screenshotPreviewFirstPage(fixture);
    const exportPng = await screenshotExportFirstPage(fixture);

    if (process.env.WRITE_DEBUG_LAYOUT_VISUAL === '1') {
      const debugDir = path.resolve(process.cwd(), '..', 'test-results');
      await fs.mkdir(debugDir, { recursive: true });
      await fs.writeFile(path.join(debugDir, 'layout-visual-preview.png'), previewPng);
      await fs.writeFile(path.join(debugDir, 'layout-visual-export-page1.png'), exportPng);
    }

    const previewGrid = buildDensityGrid(previewPng);
    const exportGrid = buildDensityGrid(exportPng);
    const heatmapDrift = meanAbsoluteDifference(previewGrid.densities, exportGrid.densities);

    const previewTopRight = quadrantDensity(previewGrid, 0, 5, 5, previewGrid.cols);
    const exportTopMid = quadrantDensity(exportGrid, 0, 5, 2, 5);
    const exportTopRight = quadrantDensity(exportGrid, 0, 5, 5, exportGrid.cols);

    if (heatmapDrift >= MAX_HEATMAP_DRIFT) {
      throw new Error(`preview/export heatmap drift too high (${heatmapDrift.toFixed(4)} >= ${MAX_HEATMAP_DRIFT})`);
    }

    if (previewTopRight < MIN_PREVIEW_TOP_RIGHT_DENSITY) {
      throw new Error(`preview wrap density drifted out of the right reading column (${previewTopRight.toFixed(4)})`);
    }

    if (exportTopMid < MIN_EXPORT_TOP_MID_DENSITY || exportTopRight >= exportTopMid) {
      throw new Error(`export wrap collapsed toward a thin right-edge strip (${JSON.stringify({
        exportTopMid,
        exportTopRight,
      })})`);
    }
  }, 120_000);
});
