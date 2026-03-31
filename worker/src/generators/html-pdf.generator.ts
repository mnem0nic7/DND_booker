import { chromium, type Page } from 'playwright-core';
import {
  buildFlowTextLayoutShadowTelemetry,
  compileFlowModel,
  compileMeasuredPageModel,
  measureFlowTextUnits,
  parseTextLayoutEngineMode,
  type DocumentContent,
  type DocumentKind,
  type LayoutPlan,
  type MeasuredLayoutUnitMetric,
  type PageModel,
  type PagePreset,
} from '@dnd-booker/shared';
import { ensureNodeCanvasMeasurementBackend } from '@dnd-booker/text-layout/node';
import { assembleHtml } from '../renderers/html-assembler.js';

const DEFAULT_EXECUTABLE_PATHS = [
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
].filter((value): value is string => Boolean(value));

function resolveChromiumExecutablePath(): string {
  return DEFAULT_EXECUTABLE_PATHS[0];
}

async function waitForDocumentReady(page: Page) {
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await (document as Document & { fonts?: { ready?: Promise<unknown> } }).fonts?.ready;
    }
  });
  await page.waitForTimeout(150);
}

function collectMeasurements(unitIds: string[] | null): MeasuredLayoutUnitMetric[] {
  const allowedUnitIds = unitIds ? new Set(unitIds) : null;
  return Array.from(document.querySelectorAll<HTMLElement>('[data-layout-unit-id]'))
    .map((element) => {
      const unitId = element.dataset.layoutUnitId;
      if (!unitId || (allowedUnitIds && !allowedUnitIds.has(unitId))) return null;
      const rect = element.getBoundingClientRect();
      const computed = window.getComputedStyle(element);
      const marginTop = Number.parseFloat(computed.marginTop || '0') || 0;
      const marginBottom = Number.parseFloat(computed.marginBottom || '0') || 0;
      const contentHeight = Math.max(
        rect.height,
        element.scrollHeight,
        element.offsetHeight,
      );
      return {
        unitId,
        heightPx: Math.max(1, Math.ceil(contentHeight + marginTop + marginBottom)),
      };
    })
    .filter((entry): entry is MeasuredLayoutUnitMetric => Boolean(entry));
}

export async function measureDocumentPageModels(input: {
  documents: Array<{
    title: string;
    content: DocumentContent | null;
    kind?: DocumentKind | null;
    sortOrder: number;
    layoutPlan?: LayoutPlan | null;
  }>;
  theme: string;
  pagePreset: PagePreset;
}): Promise<Array<PageModel | null>> {
  const textLayoutMode = parseTextLayoutEngineMode(process.env.TEXT_LAYOUT_ENGINE_MODE);
  if (textLayoutMode !== 'legacy') {
    ensureNodeCanvasMeasurementBackend();
  }

  const browser = await chromium.launch({
    executablePath: resolveChromiumExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    const models: Array<PageModel | null> = [];

    for (const document of input.documents) {
      if (!document.content) {
        models.push(null);
        continue;
      }

      const flow = compileFlowModel(
        document.content,
        document.layoutPlan ?? null,
        input.pagePreset,
        {
          documentKind: document.kind ?? null,
          documentTitle: document.title,
        },
      );

      const html = assembleHtml({
        documents: [{
          ...document,
          pageModel: null,
        }],
        theme: input.theme,
        projectTitle: document.title,
        pagePreset: input.pagePreset,
        renderMode: 'flow',
      });

      await page.setContent(html, { waitUntil: 'load' });
      await waitForDocumentReady(page);
      let finalMeasurements: MeasuredLayoutUnitMetric[];

      if (textLayoutMode === 'legacy') {
        finalMeasurements = await page.evaluate(collectMeasurements, null);
      } else if (textLayoutMode === 'shadow') {
        const legacyMeasurements = await page.evaluate(collectMeasurements, null);
        const engineResult = measureFlowTextUnits(flow.flow, {
          theme: input.theme,
          documentKind: document.kind ?? null,
          documentTitle: document.title,
          fallbackMeasurements: legacyMeasurements,
        });
        const legacyPageModel = compileMeasuredPageModel(flow.flow, legacyMeasurements, {
          documentKind: document.kind ?? null,
          documentTitle: document.title,
        });
        const enginePageModel = compileMeasuredPageModel(flow.flow, engineResult.measurements, {
          documentKind: document.kind ?? null,
          documentTitle: document.title,
          respectManualPageBreaks: true,
        });
        console.info('[text-layout:shadow]', {
          scope: 'worker-html-pdf',
          documentTitle: document.title,
          pagePreset: input.pagePreset,
          ...buildFlowTextLayoutShadowTelemetry({
            legacyMeasurements,
            engineMeasurements: engineResult.measurements,
            engineTelemetry: engineResult.telemetry,
            legacyPageCount: legacyPageModel.pages.length,
            pretextPageCount: enginePageModel.pages.length,
          }),
        });
        finalMeasurements = legacyMeasurements;
      } else {
        const initialEngineResult = measureFlowTextUnits(flow.flow, {
          theme: input.theme,
          documentKind: document.kind ?? null,
          documentTitle: document.title,
        });
        const fallbackMeasurements = initialEngineResult.unsupportedUnitIds.length > 0
          ? await page.evaluate(collectMeasurements, initialEngineResult.unsupportedUnitIds)
          : [];
        const engineResult = initialEngineResult.unsupportedUnitIds.length > 0
          ? measureFlowTextUnits(flow.flow, {
            theme: input.theme,
            documentKind: document.kind ?? null,
            documentTitle: document.title,
            fallbackMeasurements,
          })
          : initialEngineResult;
        finalMeasurements = engineResult.measurements;
      }

      models.push(compileMeasuredPageModel(flow.flow, finalMeasurements, {
        documentKind: document.kind ?? null,
        documentTitle: document.title,
        respectManualPageBreaks: textLayoutMode === 'pretext',
      }));
    }

    return models;
  } finally {
    await browser.close();
  }
}

export async function generateHtmlPdf(input: {
  html: string;
  title: string;
}): Promise<Buffer> {
  const browser = await chromium.launch({
    executablePath: resolveChromiumExecutablePath(),
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(input.html, {
      waitUntil: 'load',
    });
    await page.emulateMedia({ media: 'print' });
    await waitForDocumentReady(page);

    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: false,
      margin: {
        top: '0in',
        bottom: '0in',
        left: '0in',
        right: '0in',
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
