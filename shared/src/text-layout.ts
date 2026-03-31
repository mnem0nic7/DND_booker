import {
  measureTextSurfaces,
  type StyledTextRun,
  type TextLayoutSurface,
  type TextSurfaceMeasurement,
} from '@dnd-booker/text-layout';
import { estimateFlowUnitHeight, getLayoutMeasurementFrame } from './layout-plan.js';
import {
  normalizeChapterHeaderTitle,
  normalizeEncounterCreatures,
  normalizeEncounterEntries,
  normalizeEncounterTableAttrs,
  normalizeNpcProfileAttrs,
  normalizeStatBlockAttrs,
  resolveRandomTableEntries,
} from './renderers/utils.js';
import { extractTocEntriesFromContent } from './toc.js';
import type { DocumentContent } from './types/document.js';
import type {
  LayoutFlowFragment,
  LayoutFlowModel,
  LayoutFlowUnit,
  MeasuredLayoutUnitMetric,
} from './types/layout-plan.js';

export type TextLayoutEngineMode = 'legacy' | 'shadow' | 'pretext';

interface ThemeTypography {
  bodyFontFamily: string;
  headingFontFamily: string;
  bodyFontSizePx: number;
  bodyLineHeightPx: number;
}

interface InlineStyle {
  fontFamily: string;
  fontSizePx: number;
  fontWeight?: string | number;
  fontStyle?: string;
  whiteSpace?: 'normal' | 'pre-wrap';
  letterSpacingPx?: number;
}

interface SurfaceExtractionResult {
  surfaces: TextLayoutSurface[];
  supported: boolean;
}

interface MeasureFlowTextUnitsOptions {
  theme?: string | null;
  documentKind?: string | null;
  documentTitle?: string | null;
  fallbackMeasurements?: MeasuredLayoutUnitMetric[] | null;
}

export interface FlowTextLayoutTelemetry {
  surfaceCount: number;
  supportedSurfaceCount: number;
  unsupportedSurfaceCount: number;
  supportedUnitCount: number;
  unsupportedUnitCount: number;
}

export interface FlowTextLayoutShadowTelemetry extends FlowTextLayoutTelemetry {
  legacyPageCount: number;
  pretextPageCount: number;
  pageCountDelta: number;
  totalHeightDeltaPx: number;
}

export interface FlowTextLayoutMeasurementResult {
  measurements: MeasuredLayoutUnitMetric[];
  surfaces: TextLayoutSurface[];
  telemetry: FlowTextLayoutTelemetry;
  unsupportedUnitIds: string[];
}

const THEME_FONTS: Record<string, Pick<ThemeTypography, 'headingFontFamily' | 'bodyFontFamily'>> = {
  'classic-parchment': {
    headingFontFamily: "'Cinzel', serif",
    bodyFontFamily: "'Crimson Text', serif",
  },
  'gilded-folio': {
    headingFontFamily: "'Cinzel Decorative', 'Cinzel', serif",
    bodyFontFamily: "'Libre Baskerville', serif",
  },
  'dmguild': {
    headingFontFamily: "'Cinzel Decorative', 'Cinzel', serif",
    bodyFontFamily: "'Libre Baskerville', serif",
  },
  'dark-tome': {
    headingFontFamily: "'Uncial Antiqua', serif",
    bodyFontFamily: "'EB Garamond', serif",
  },
  'clean-modern': {
    headingFontFamily: "'Inter', sans-serif",
    bodyFontFamily: "'Merriweather', serif",
  },
  'fey-wild': {
    headingFontFamily: "'Dancing Script', cursive",
    bodyFontFamily: "'Lora', serif",
  },
  'infernal': {
    headingFontFamily: "'Pirata One', cursive",
    bodyFontFamily: "'Bitter', serif",
  },
};

const UNSUPPORTED_NODE_TYPES = new Set([
  'titlePage',
  'creditsPage',
  'backCover',
  'pageBreak',
  'columnBreak',
  'fullBleedImage',
  'mapBlock',
  'pageBorder',
  'codeBlock',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
]);

function resolveThemeTypography(theme?: string | null): ThemeTypography {
  const fonts = THEME_FONTS[theme ?? ''] ?? THEME_FONTS['classic-parchment'];
  return {
    ...fonts,
    bodyFontSizePx: 16,
    bodyLineHeightPx: 24,
  };
}

export function parseTextLayoutEngineMode(value: string | null | undefined): TextLayoutEngineMode {
  if (value === 'shadow' || value === 'pretext') return value;
  return 'legacy';
}

function createRun(text: string, style: InlineStyle): StyledTextRun {
  return {
    text,
    fontFamily: style.fontFamily,
    fontSizePx: style.fontSizePx,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    whiteSpace: style.whiteSpace ?? 'normal',
    letterSpacingPx: style.letterSpacingPx,
  };
}

function parseFontSize(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function applyMarks(baseStyle: InlineStyle, node: DocumentContent): { style: InlineStyle; supported: boolean } {
  let nextStyle = { ...baseStyle };
  let supported = true;

  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        nextStyle.fontWeight = 700;
        break;
      case 'italic':
        nextStyle.fontStyle = 'italic';
        break;
      case 'textStyle': {
        const fontSizePx = parseFontSize(mark.attrs?.fontSize);
        if (fontSizePx !== null) {
          nextStyle.fontSizePx = fontSizePx;
        }
        break;
      }
      case 'code':
        supported = false;
        break;
      default:
        break;
    }
  }

  return { style: nextStyle, supported };
}

function collectInlineRuns(node: DocumentContent | undefined, baseStyle: InlineStyle): { runs: StyledTextRun[]; supported: boolean } {
  if (!node) return { runs: [], supported: true };

  if (node.type === 'text') {
    const { style, supported } = applyMarks(baseStyle, node);
    return {
      runs: node.text ? [createRun(node.text, style)] : [],
      supported,
    };
  }

  if (node.type === 'hardBreak') {
    return {
      runs: [createRun('\n', { ...baseStyle, whiteSpace: 'pre-wrap' })],
      supported: true,
    };
  }

  if (node.type === 'codeBlock') {
    return { runs: [], supported: false };
  }

  const runs: StyledTextRun[] = [];
  let supported = true;
  for (const child of node.content ?? []) {
    const result = collectInlineRuns(child, baseStyle);
    runs.push(...result.runs);
    supported = supported && result.supported;
  }
  return { runs, supported };
}

function resolveUnitWidth(
  flow: LayoutFlowModel,
  unit: LayoutFlowUnit,
  options: Pick<MeasureFlowTextUnitsOptions, 'documentKind' | 'documentTitle'>,
): number {
  const frame = getLayoutMeasurementFrame(flow.preset, {
    documentKind: options.documentKind,
    documentTitle: options.documentTitle,
  }, flow.sectionRecipe);

  if (flow.preset === 'epub') return frame.contentWidthPx;
  if (unit.span === 'full_page' || unit.span === 'both_columns') return frame.contentWidthPx;
  if (unit.placement === 'hero_top' || unit.placement === 'full_page_insert') return frame.contentWidthPx;
  return frame.columnWidthPx;
}

function createSurface(input: {
  unitId: string;
  nodeId: string;
  kind: string;
  index: number;
  theme?: string | null;
  widthPx: number;
  lineHeightPx: number;
  minLineCount?: number;
  supportLevel?: 'supported' | 'unsupported';
  runs: StyledTextRun[];
  boxModel?: TextLayoutSurface['boxModel'];
  whiteSpace?: 'normal' | 'pre-wrap';
}): TextLayoutSurface {
  return {
    surfaceId: `${input.unitId}:${input.nodeId}:${input.kind}:${input.index}`,
    unitId: input.unitId,
    nodeId: input.nodeId,
    kind: input.kind,
    theme: input.theme ?? null,
    supportLevel: input.supportLevel ?? 'supported',
    runs: input.runs,
    widthPx: input.widthPx,
    lineHeightPx: input.lineHeightPx,
    minLineCount: input.minLineCount,
    boxModel: input.boxModel,
    whiteSpace: input.whiteSpace,
  };
}

function buildTextLines(lines: Array<{ label?: string; value: string }>, style: InlineStyle): StyledTextRun[] {
  return lines.flatMap((line, index) => {
    const runs: StyledTextRun[] = [];
    if (line.label) {
      runs.push(createRun(`${line.label} `, { ...style, fontWeight: 700 }));
    }
    runs.push(createRun(line.value, style));
    if (index < lines.length - 1) {
      runs.push(createRun('\n', { ...style, whiteSpace: 'pre-wrap' }));
    }
    return runs;
  });
}

function extractTocEntriesFromFlow(flow: LayoutFlowModel): ReturnType<typeof extractTocEntriesFromContent> {
  return extractTocEntriesFromContent({
    type: 'doc',
    content: flow.fragments
      .filter((fragment) => fragment.nodeType !== 'tableOfContents')
      .map((fragment) => fragment.content),
  });
}

function extractParagraphLikeSurface(
  node: DocumentContent,
  baseStyle: InlineStyle,
  unitId: string,
  widthPx: number,
  theme: string | null | undefined,
  kind: string,
  index: number,
): SurfaceExtractionResult {
  const inline = collectInlineRuns(node, baseStyle);
  return {
    supported: inline.supported,
    surfaces: [
      createSurface({
        unitId,
        nodeId: String(node.attrs?.nodeId ?? `${unitId}:${index}`),
        kind,
        index,
        theme,
        widthPx,
        lineHeightPx: Math.round(baseStyle.fontSizePx * 1.5),
        minLineCount: 1,
        runs: inline.runs,
        boxModel: {
          marginBottomPx: 8,
        },
        whiteSpace: baseStyle.whiteSpace ?? 'normal',
      }),
    ],
  };
}

function extractListSurfaces(
  node: DocumentContent,
  bodyStyle: InlineStyle,
  unitId: string,
  widthPx: number,
  theme: string | null | undefined,
): SurfaceExtractionResult {
  const surfaces: TextLayoutSurface[] = [];
  let supported = true;
  let itemIndex = 0;

  for (const child of node.content ?? []) {
    const inline = collectInlineRuns(child, bodyStyle);
    supported = supported && inline.supported;
    surfaces.push(createSurface({
      unitId,
      nodeId: String(child.attrs?.nodeId ?? `${unitId}:item:${itemIndex}`),
      kind: 'list_item',
      index: itemIndex,
      theme,
      widthPx: Math.max(1, widthPx - 24),
      lineHeightPx: 24,
      minLineCount: 1,
      runs: inline.runs,
      boxModel: {
        marginBottomPx: 6,
      },
    }));
    itemIndex += 1;
  }

  return { surfaces, supported };
}

function extractReadAloudBox(
  fragment: LayoutFlowFragment,
  bodyStyle: InlineStyle,
  unitId: string,
  widthPx: number,
  theme: string | null | undefined,
): SurfaceExtractionResult {
  const surfaces: TextLayoutSurface[] = [
    createSurface({
      unitId,
      nodeId: fragment.nodeId,
      kind: 'read_aloud_label',
      index: 0,
      theme,
      widthPx,
      lineHeightPx: 18,
      minLineCount: 1,
      runs: [createRun('Read Aloud', { ...bodyStyle, fontFamily: bodyStyle.fontFamily, fontSizePx: 12, fontWeight: 700, letterSpacingPx: 0.4 })],
      boxModel: {
        paddingTopPx: 16,
        paddingLeftPx: 18,
        paddingRightPx: 18,
        marginBottomPx: 8,
      },
    }),
  ];
  let supported = true;

  let childIndex = 1;
  for (const child of fragment.content.content ?? []) {
    const result = child.type === 'paragraph' || child.type === 'heading'
      ? extractParagraphLikeSurface(
        child,
        child.type === 'heading'
          ? { ...bodyStyle, fontFamily: bodyStyle.fontFamily, fontSizePx: 20, fontWeight: 700 }
          : bodyStyle,
        unitId,
        widthPx,
        theme,
        child.type,
        childIndex,
      )
      : child.type === 'bulletList' || child.type === 'orderedList'
        ? extractListSurfaces(child, bodyStyle, unitId, widthPx, theme)
        : { surfaces: [], supported: false };

    supported = supported && result.supported;
    const isLast = childIndex === (fragment.content.content?.length ?? 0);
    surfaces.push(...result.surfaces.map((surface) => ({
      ...surface,
      boxModel: {
        ...(surface.boxModel ?? {}),
        paddingLeftPx: 18,
        paddingRightPx: 18,
        paddingBottomPx: isLast ? 16 : surface.boxModel?.paddingBottomPx,
      },
    })));
    childIndex += 1;
  }

  return { surfaces, supported };
}

function extractSidebarCallout(
  fragment: LayoutFlowFragment,
  bodyStyle: InlineStyle,
  unitId: string,
  widthPx: number,
  theme: string | null | undefined,
): SurfaceExtractionResult {
  const title = String(fragment.content.attrs?.title || 'Note');
  const surfaces: TextLayoutSurface[] = [
    createSurface({
      unitId,
      nodeId: fragment.nodeId,
      kind: 'sidebar_title',
      index: 0,
      theme,
      widthPx,
      lineHeightPx: 20,
      minLineCount: 1,
      runs: [createRun(title, { ...bodyStyle, fontSizePx: 14, fontWeight: 700 })],
      boxModel: {
        paddingTopPx: 16,
        paddingLeftPx: 18,
        paddingRightPx: 18,
        marginBottomPx: 8,
      },
    }),
  ];
  let supported = true;
  let childIndex = 1;

  for (const child of fragment.content.content ?? []) {
    const result = child.type === 'paragraph' || child.type === 'heading'
      ? extractParagraphLikeSurface(
        child,
        child.type === 'heading'
          ? { ...bodyStyle, fontFamily: bodyStyle.fontFamily, fontSizePx: 20, fontWeight: 700 }
          : bodyStyle,
        unitId,
        widthPx,
        theme,
        child.type,
        childIndex,
      )
      : child.type === 'bulletList' || child.type === 'orderedList'
        ? extractListSurfaces(child, bodyStyle, unitId, widthPx, theme)
        : { surfaces: [], supported: false };

    supported = supported && result.supported;
    const isLast = childIndex === (fragment.content.content?.length ?? 0);
    surfaces.push(...result.surfaces.map((surface) => ({
      ...surface,
      boxModel: {
        ...(surface.boxModel ?? {}),
        paddingLeftPx: 18,
        paddingRightPx: 18,
        paddingBottomPx: isLast ? 16 : surface.boxModel?.paddingBottomPx,
      },
    })));
    childIndex += 1;
  }

  return { surfaces, supported };
}

function extractCustomAttributeSurfaces(
  fragment: LayoutFlowFragment,
  theme: string | null | undefined,
  widthPx: number,
  typography: ThemeTypography,
  tocEntries: ReturnType<typeof extractTocEntriesFromContent>,
): SurfaceExtractionResult {
  const bodyStyle: InlineStyle = {
    fontFamily: typography.bodyFontFamily,
    fontSizePx: typography.bodyFontSizePx,
  };
  const headingStyle: InlineStyle = {
    fontFamily: typography.headingFontFamily,
    fontSizePx: 26,
    fontWeight: 700,
  };

  switch (fragment.nodeType) {
    case 'chapterHeader': {
      const subtitle = String(fragment.content.attrs?.subtitle || '').trim();
      const chapterNumber = String(fragment.content.attrs?.chapterNumber || '').trim();
      const title = normalizeChapterHeaderTitle(fragment.content.attrs?.title, chapterNumber);
      const surfaces: TextLayoutSurface[] = [];
      if (chapterNumber) {
        surfaces.push(createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'chapter_number',
          index: 0,
          theme,
          widthPx,
          lineHeightPx: 22,
          minLineCount: 1,
          runs: [createRun(chapterNumber, { ...headingStyle, fontSizePx: 16 })],
          boxModel: { paddingTopPx: 48, marginBottomPx: 10 },
        }));
      }
      surfaces.push(createSurface({
        unitId: fragment.unitId,
        nodeId: fragment.nodeId,
        kind: 'chapter_title',
        index: 1,
        theme,
        widthPx,
        lineHeightPx: 44,
        minLineCount: 1,
        runs: [createRun(title, { ...headingStyle, fontSizePx: 36 })],
        boxModel: { marginBottomPx: 12 },
      }));
      if (subtitle) {
        surfaces.push(createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'chapter_subtitle',
          index: 2,
          theme,
          widthPx,
          lineHeightPx: 24,
          minLineCount: 1,
          runs: [createRun(subtitle, { ...bodyStyle, fontSizePx: 16, fontStyle: 'italic' })],
          boxModel: { paddingBottomPx: 42 },
        }));
      } else if (surfaces.length > 0) {
        surfaces[surfaces.length - 1] = {
          ...surfaces[surfaces.length - 1]!,
          boxModel: {
            ...(surfaces[surfaces.length - 1]!.boxModel ?? {}),
            paddingBottomPx: 42,
          },
        };
      }
      return { surfaces, supported: true };
    }
    case 'spellCard': {
      const attrs = fragment.content.attrs ?? {};
      const lines = [
        { label: 'Casting Time', value: String(attrs.castingTime || '') },
        { label: 'Range', value: String(attrs.range || '') },
        { label: 'Components', value: String(attrs.components || '') },
        { label: 'Duration', value: String(attrs.duration || '') },
      ].filter((line) => line.value.trim().length > 0);
      const surfaces = [
        createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'spell_name',
          index: 0,
          theme,
          widthPx,
          lineHeightPx: 28,
          minLineCount: 1,
          runs: [createRun(String(attrs.name || ''), { ...headingStyle, fontSizePx: 24 })],
          boxModel: { paddingTopPx: 18, marginBottomPx: 6 },
        }),
        createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'spell_subtitle',
          index: 1,
          theme,
          widthPx,
          lineHeightPx: 20,
          minLineCount: 1,
          runs: [createRun(`${attrs.level ?? 0}-level ${String(attrs.school || 'spell')}`, { ...bodyStyle, fontSizePx: 14, fontStyle: 'italic' })],
          boxModel: { marginBottomPx: 10 },
        }),
        createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'spell_properties',
          index: 2,
          theme,
          widthPx,
          lineHeightPx: 22,
          runs: buildTextLines(lines, bodyStyle),
          boxModel: { marginBottomPx: 10 },
          whiteSpace: 'pre-wrap',
        }),
        createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'spell_description',
          index: 3,
          theme,
          widthPx,
          lineHeightPx: 24,
          minLineCount: 1,
          runs: [createRun(String(attrs.description || ''), bodyStyle)],
          boxModel: { paddingBottomPx: String(attrs.higherLevels || '').trim() ? 8 : 16 },
        }),
      ];
      const higherLevels = String(attrs.higherLevels || '').trim();
      if (higherLevels) {
        surfaces.push(createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'spell_higher_levels',
          index: 4,
          theme,
          widthPx,
          lineHeightPx: 22,
          minLineCount: 1,
          runs: buildTextLines([{ label: 'At Higher Levels.', value: higherLevels }], bodyStyle),
          boxModel: { paddingBottomPx: 16 },
          whiteSpace: 'pre-wrap',
        }));
      }
      return { surfaces, supported: true };
    }
    case 'magicItem': {
      const attrs = fragment.content.attrs ?? {};
      const subtitle = [
        String(attrs.type || 'Wondrous item'),
        String(attrs.rarity || 'uncommon'),
        attrs.requiresAttunement ? 'requires attunement' : '',
      ].filter(Boolean).join(', ');
      const surfaces = [
        createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'magic_item_name',
          index: 0,
          theme,
          widthPx,
          lineHeightPx: 28,
          minLineCount: 1,
          runs: [createRun(String(attrs.name || ''), { ...headingStyle, fontSizePx: 24 })],
          boxModel: { paddingTopPx: 18, marginBottomPx: 6 },
        }),
        createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'magic_item_subtitle',
          index: 1,
          theme,
          widthPx,
          lineHeightPx: 20,
          minLineCount: 1,
          runs: [createRun(subtitle, { ...bodyStyle, fontSizePx: 14, fontStyle: 'italic' })],
          boxModel: { marginBottomPx: 10 },
        }),
        createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'magic_item_description',
          index: 2,
          theme,
          widthPx,
          lineHeightPx: 24,
          minLineCount: 1,
          runs: [createRun(String(attrs.description || ''), bodyStyle)],
          boxModel: { marginBottomPx: String(attrs.properties || '').trim() ? 8 : 16 },
        }),
      ];
      const properties = String(attrs.properties || '').trim();
      if (properties) {
        surfaces.push(createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'magic_item_properties',
          index: 3,
          theme,
          widthPx,
          lineHeightPx: 22,
          minLineCount: 1,
          runs: [createRun(properties, bodyStyle)],
          boxModel: { paddingBottomPx: 16 },
        }));
      }
      return { surfaces, supported: true };
    }
    case 'handout': {
      const attrs = fragment.content.attrs ?? {};
      return {
        supported: true,
        surfaces: [
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'handout_title',
            index: 0,
            theme,
            widthPx,
            lineHeightPx: 28,
            minLineCount: 1,
            runs: [createRun(String(attrs.title || ''), { ...headingStyle, fontSizePx: 22 })],
            boxModel: { paddingTopPx: 24, paddingLeftPx: 24, paddingRightPx: 24, marginBottomPx: 10 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'handout_content',
            index: 1,
            theme,
            widthPx,
            lineHeightPx: 24,
            minLineCount: 2,
            runs: [createRun(String(attrs.content || ''), { ...bodyStyle, whiteSpace: 'pre-wrap' })],
            boxModel: { paddingLeftPx: 24, paddingRightPx: 24, paddingBottomPx: 24 },
            whiteSpace: 'pre-wrap',
          }),
        ],
      };
    }
    case 'classFeature': {
      const attrs = fragment.content.attrs ?? {};
      return {
        supported: true,
        surfaces: [
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'class_feature_name',
            index: 0,
            theme,
            widthPx,
            lineHeightPx: 28,
            minLineCount: 1,
            runs: [createRun(String(attrs.name || ''), { ...headingStyle, fontSizePx: 22 })],
            boxModel: { paddingTopPx: 16, marginBottomPx: 6 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'class_feature_subtitle',
            index: 1,
            theme,
            widthPx,
            lineHeightPx: 20,
            minLineCount: 1,
            runs: [createRun(`Level ${String(attrs.level || 1)} ${String(attrs.className || '')} Feature`, { ...bodyStyle, fontSizePx: 14, fontStyle: 'italic' })],
            boxModel: { marginBottomPx: 10 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'class_feature_description',
            index: 2,
            theme,
            widthPx,
            lineHeightPx: 24,
            minLineCount: 1,
            runs: [createRun(String(attrs.description || ''), bodyStyle)],
            boxModel: { paddingBottomPx: 16 },
          }),
        ],
      };
    }
    case 'raceBlock': {
      const attrs = fragment.content.attrs ?? {};
      let featureLines: Array<{ label?: string; value: string }> = [
        { label: 'Ability Score Increase.', value: String(attrs.abilityScoreIncreases || '') },
        { label: 'Size.', value: String(attrs.size || '') },
        { label: 'Speed.', value: String(attrs.speed || '') },
        { label: 'Languages.', value: String(attrs.languages || '') },
      ].filter((line) => line.value.trim().length > 0);
      try {
        const parsed = JSON.parse(String(attrs.features || '[]'));
        if (Array.isArray(parsed)) {
          featureLines = featureLines.concat(parsed.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return [];
            const name = String((entry as { name?: string }).name || '').trim();
            const description = String((entry as { description?: string; desc?: string }).description ?? (entry as { desc?: string }).desc ?? '').trim();
            if (!name && !description) return [];
            return [{ label: `${name}.`, value: description }];
          }));
        }
      } catch {
        // Ignore malformed feature payloads and fall back to the core fields.
      }
      return {
        supported: true,
        surfaces: [
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'race_name',
            index: 0,
            theme,
            widthPx,
            lineHeightPx: 28,
            minLineCount: 1,
            runs: [createRun(String(attrs.name || ''), { ...headingStyle, fontSizePx: 24 })],
            boxModel: { paddingTopPx: 18, marginBottomPx: 10 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'race_features',
            index: 1,
            theme,
            widthPx,
            lineHeightPx: 22,
            minLineCount: 2,
            runs: buildTextLines(featureLines, bodyStyle),
            boxModel: { paddingBottomPx: 18 },
            whiteSpace: 'pre-wrap',
          }),
        ],
      };
    }
    case 'randomTable': {
      const attrs = fragment.content.attrs ?? {};
      const entries = resolveRandomTableEntries(attrs);
      const lines = entries.map((entry) => ({ label: entry.roll, value: entry.result }));
      return {
        supported: true,
        surfaces: [
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'random_table_title',
            index: 0,
            theme,
            widthPx,
            lineHeightPx: 26,
            minLineCount: 1,
            runs: [createRun(String(attrs.title || ''), { ...headingStyle, fontSizePx: 20 })],
            boxModel: { paddingTopPx: 16, marginBottomPx: 8 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'random_table_rows',
            index: 1,
            theme,
            widthPx,
            lineHeightPx: 22,
            minLineCount: Math.max(1, lines.length),
            runs: buildTextLines(lines, bodyStyle),
            boxModel: { paddingBottomPx: 16 },
            whiteSpace: 'pre-wrap',
          }),
        ],
      };
    }
    case 'encounterTable': {
      const normalized = normalizeEncounterTableAttrs(fragment.content.attrs ?? {});
      const entries = normalizeEncounterEntries(normalized.entries);
      const creatures = normalizeEncounterCreatures(normalized.creatures);
      const rawLines: Array<{ label?: string; value: string } | null> = [
        { label: 'Overview.', value: String(normalized.description || '') },
        { label: 'Objective.', value: String(normalized.objective || '') },
        { label: 'Opposition.', value: String(normalized.opposition || '') },
        { label: 'Terrain.', value: String(normalized.terrain || '') },
        { label: 'Setup.', value: String(normalized.setup || '') },
        { label: 'Tactics.', value: String(normalized.tactics || '') },
        { label: 'Rewards.', value: String(normalized.rewards || '') },
        { label: 'Aftermath.', value: String(normalized.aftermath || '') },
        creatures.length > 0
          ? { label: 'Enemies.', value: creatures.map((creature) => `${creature.quantity}x ${creature.name}${creature.challengeRating ? ` (CR ${creature.challengeRating})` : ''}`).join('; ') }
          : null,
      ];
      const lines = rawLines.filter((line): line is { label: string; value: string } => (
        line !== null && line.value.trim().length > 0
      ));
      const entryLines = entries.map((entry) => ({ label: entry.cr ? `${entry.cr}` : 'Encounter', value: entry.description }));
      return {
        supported: true,
        surfaces: [
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'encounter_title',
            index: 0,
            theme,
            widthPx,
            lineHeightPx: 26,
            minLineCount: 1,
            runs: [createRun(String(normalized.title || normalized.name || normalized.environment || 'Encounter Details'), { ...headingStyle, fontSizePx: 20 })],
            boxModel: { paddingTopPx: 16, marginBottomPx: 8 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'encounter_entries',
            index: 1,
            theme,
            widthPx,
            lineHeightPx: 22,
            minLineCount: Math.max(1, entryLines.length),
            runs: buildTextLines(entryLines, bodyStyle),
            boxModel: { marginBottomPx: lines.length > 0 ? 10 : 16 },
            whiteSpace: 'pre-wrap',
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'encounter_details',
            index: 2,
            theme,
            widthPx,
            lineHeightPx: 22,
            minLineCount: lines.length > 0 ? 1 : 0,
            runs: buildTextLines(lines, bodyStyle),
            boxModel: { paddingBottomPx: 16 },
            whiteSpace: 'pre-wrap',
          }),
        ],
      };
    }
    case 'npcProfile': {
      const normalized = normalizeNpcProfileAttrs(fragment.content.attrs ?? {});
      const lines = [
        { label: 'Goal.', value: String(normalized.goal || '') },
        { label: 'What They Know.', value: String(normalized.whatTheyKnow || '') },
        { label: 'Leverage.', value: String(normalized.leverage || '') },
        { label: 'Likely Reaction.', value: String(normalized.likelyReaction || '') },
        { label: 'Personality Traits.', value: String(normalized.personalityTraits || '') },
        { label: 'Ideals.', value: String(normalized.ideals || '') },
        { label: 'Bonds.', value: String(normalized.bonds || '') },
        { label: 'Flaws.', value: String(normalized.flaws || '') },
      ].filter((line) => line.value.trim().length > 0);
      return {
        supported: true,
        surfaces: [
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'npc_name',
            index: 0,
            theme,
            widthPx,
            lineHeightPx: 28,
            minLineCount: 1,
            runs: [createRun(String(normalized.name || ''), { ...headingStyle, fontSizePx: 24 })],
            boxModel: { paddingTopPx: 16, marginBottomPx: 6 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'npc_subtitle',
            index: 1,
            theme,
            widthPx,
            lineHeightPx: 20,
            minLineCount: 1,
            runs: [createRun(`${String(normalized.race || '')} ${String(normalized.class || '')}`.trim(), { ...bodyStyle, fontSizePx: 14, fontStyle: 'italic' })],
            boxModel: { marginBottomPx: 10 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'npc_description',
            index: 2,
            theme,
            widthPx,
            lineHeightPx: 24,
            minLineCount: 1,
            runs: [createRun(String(normalized.description || ''), bodyStyle)],
            boxModel: { marginBottomPx: lines.length > 0 ? 8 : 16 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'npc_traits',
            index: 3,
            theme,
            widthPx,
            lineHeightPx: 22,
            minLineCount: lines.length > 0 ? 1 : 0,
            runs: buildTextLines(lines, bodyStyle),
            boxModel: { paddingBottomPx: 16 },
            whiteSpace: 'pre-wrap',
          }),
        ],
      };
    }
    case 'statBlock': {
      const normalized = normalizeStatBlockAttrs(fragment.content.attrs ?? {});
      const abilityLines = [
        `STR ${String(normalized.str ?? 10)} (${Math.floor((Number(normalized.str ?? 10) - 10) / 2) >= 0 ? '+' : ''}${Math.floor((Number(normalized.str ?? 10) - 10) / 2)})`,
        `DEX ${String(normalized.dex ?? 10)} (${Math.floor((Number(normalized.dex ?? 10) - 10) / 2) >= 0 ? '+' : ''}${Math.floor((Number(normalized.dex ?? 10) - 10) / 2)})`,
        `CON ${String(normalized.con ?? 10)} (${Math.floor((Number(normalized.con ?? 10) - 10) / 2) >= 0 ? '+' : ''}${Math.floor((Number(normalized.con ?? 10) - 10) / 2)})`,
        `INT ${String(normalized.int ?? 10)} (${Math.floor((Number(normalized.int ?? 10) - 10) / 2) >= 0 ? '+' : ''}${Math.floor((Number(normalized.int ?? 10) - 10) / 2)})`,
        `WIS ${String(normalized.wis ?? 10)} (${Math.floor((Number(normalized.wis ?? 10) - 10) / 2) >= 0 ? '+' : ''}${Math.floor((Number(normalized.wis ?? 10) - 10) / 2)})`,
        `CHA ${String(normalized.cha ?? 10)} (${Math.floor((Number(normalized.cha ?? 10) - 10) / 2) >= 0 ? '+' : ''}${Math.floor((Number(normalized.cha ?? 10) - 10) / 2)})`,
      ].join('  ');

      const propertyLines = [
        { label: 'Armor Class', value: `${String(normalized.ac ?? '')}${normalized.acType ? ` (${String(normalized.acType)})` : ''}`.trim() },
        { label: 'Hit Points', value: `${String(normalized.hp ?? '')}${normalized.hitDice ? ` (${String(normalized.hitDice)})` : ''}`.trim() },
        { label: 'Speed', value: String(normalized.speed || '') },
        { label: 'Saving Throws', value: String(normalized.savingThrows || '') },
        { label: 'Skills', value: String(normalized.skills || '') },
        { label: 'Damage Resistances', value: String(normalized.damageResistances || '') },
        { label: 'Damage Immunities', value: String(normalized.damageImmunities || '') },
        { label: 'Condition Immunities', value: String(normalized.conditionImmunities || '') },
        { label: 'Senses', value: String(normalized.senses || '') },
        { label: 'Languages', value: String(normalized.languages || '') },
        { label: 'Challenge', value: `${String(normalized.cr || '')}${normalized.xp ? ` (${String(normalized.xp)} XP)` : ''}`.trim() },
      ].filter((line) => line.value.trim().length > 0);

      const sections = [
        { label: 'Traits', value: String(normalized.traits || '') },
        { label: 'Actions', value: String(normalized.actions || '') },
        { label: 'Reactions', value: String(normalized.reactions || '') },
        { label: 'Legendary Actions', value: String(normalized.legendaryActions || '') },
      ].flatMap((section) => {
        if (!section.value || section.value === '[]') return [];
        try {
          const parsed = JSON.parse(section.value);
          if (!Array.isArray(parsed)) return [];
          return parsed.flatMap((entry) => {
            if (!entry || typeof entry !== 'object') return [];
            const name = String((entry as { name?: string }).name || '').trim();
            const description = String((entry as { description?: string; desc?: string }).description ?? (entry as { desc?: string }).desc ?? '').trim();
            if (!name && !description) return [];
            return [{ label: `${name}.`, value: description }];
          });
        } catch {
          return [{ label: `${section.label}.`, value: section.value }];
        }
      });

      return {
        supported: true,
        surfaces: [
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'stat_block_name',
            index: 0,
            theme,
            widthPx,
            lineHeightPx: 28,
            minLineCount: 1,
            runs: [createRun(String(normalized.name || ''), { ...headingStyle, fontSizePx: 24 })],
            boxModel: { paddingTopPx: 18, marginBottomPx: 6 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'stat_block_subtitle',
            index: 1,
            theme,
            widthPx,
            lineHeightPx: 20,
            minLineCount: 1,
            runs: [createRun(`${String(normalized.size || '')} ${String(normalized.type || '')}, ${String(normalized.alignment || '')}`.trim(), { ...bodyStyle, fontSizePx: 14, fontStyle: 'italic' })],
            boxModel: { marginBottomPx: 8 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'stat_block_properties',
            index: 2,
            theme,
            widthPx,
            lineHeightPx: 22,
            minLineCount: Math.max(2, propertyLines.length),
            runs: buildTextLines(propertyLines, bodyStyle),
            boxModel: { marginBottomPx: 8 },
            whiteSpace: 'pre-wrap',
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'stat_block_abilities',
            index: 3,
            theme,
            widthPx,
            lineHeightPx: 22,
            minLineCount: 2,
            runs: [createRun(abilityLines, bodyStyle)],
            boxModel: { marginBottomPx: sections.length > 0 ? 8 : 16 },
          }),
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'stat_block_sections',
            index: 4,
            theme,
            widthPx,
            lineHeightPx: 22,
            minLineCount: sections.length > 0 ? 1 : 0,
            runs: buildTextLines(sections, bodyStyle),
            boxModel: { paddingBottomPx: 16 },
            whiteSpace: 'pre-wrap',
          }),
        ],
      };
    }
    case 'tableOfContents': {
      const title = String(fragment.content.attrs?.title || 'Table of Contents');
      const entrySurfaces = tocEntries.map((entry, index) => {
        const indentPx = Math.max(0, (entry.level - 1) * 18);
        const label = [entry.prefix, entry.title].filter((part) => part.trim().length > 0).join(' ').trim();
        return createSurface({
          unitId: fragment.unitId,
          nodeId: fragment.nodeId,
          kind: 'toc_entry',
          index: index + 1,
          theme,
          widthPx: Math.max(1, widthPx - indentPx),
          lineHeightPx: 22,
          minLineCount: 1,
          runs: [createRun(label, { ...bodyStyle, fontSizePx: 15 })],
          boxModel: {
            paddingLeftPx: indentPx,
            marginBottomPx: index === tocEntries.length - 1 ? 0 : 4,
          },
        });
      });
      return {
        supported: true,
        surfaces: [
          createSurface({
            unitId: fragment.unitId,
            nodeId: fragment.nodeId,
            kind: 'toc_title',
            index: 0,
            theme,
            widthPx,
            lineHeightPx: 30,
            minLineCount: 1,
            runs: [createRun(title, { ...headingStyle, fontSizePx: 24 })],
            boxModel: {
              paddingTopPx: 24,
              marginBottomPx: entrySurfaces.length > 0 ? 12 : 0,
              paddingBottomPx: entrySurfaces.length > 0 ? 0 : 18,
            },
          }),
          ...entrySurfaces.map((surface, index) => ({
            ...surface,
            boxModel: {
              ...(surface.boxModel ?? {}),
              paddingBottomPx: index === entrySurfaces.length - 1 ? 18 : surface.boxModel?.paddingBottomPx,
            },
          })),
        ],
      };
    }
    default:
      return { surfaces: [], supported: false };
  }
}

function extractFragmentSurfaces(
  fragment: LayoutFlowFragment,
  theme: string | null | undefined,
  widthPx: number,
  typography: ThemeTypography,
  tocEntries: ReturnType<typeof extractTocEntriesFromContent>,
): SurfaceExtractionResult {
  if (UNSUPPORTED_NODE_TYPES.has(fragment.nodeType)) {
    return { surfaces: [], supported: false };
  }

  const bodyStyle: InlineStyle = {
    fontFamily: typography.bodyFontFamily,
    fontSizePx: typography.bodyFontSizePx,
  };

  if (fragment.nodeType === 'paragraph') {
    return extractParagraphLikeSurface(fragment.content, bodyStyle, fragment.unitId, widthPx, theme, 'paragraph', 0);
  }

  if (fragment.nodeType === 'heading') {
    const level = Number(fragment.content.attrs?.level) || 1;
    const sizeByLevel: Record<number, number> = {
      1: 32,
      2: 26,
      3: 22,
      4: 20,
      5: 18,
      6: 16,
    };
    return extractParagraphLikeSurface(
      fragment.content,
      {
        fontFamily: typography.headingFontFamily,
        fontSizePx: sizeByLevel[level] ?? 20,
        fontWeight: 700,
      },
      fragment.unitId,
      widthPx,
      theme,
      'heading',
      0,
    );
  }

  if (fragment.nodeType === 'bulletList' || fragment.nodeType === 'orderedList') {
    return extractListSurfaces(fragment.content, bodyStyle, fragment.unitId, widthPx, theme);
  }

  if (fragment.nodeType === 'readAloudBox') {
    return extractReadAloudBox(fragment, bodyStyle, fragment.unitId, widthPx, theme);
  }

  if (fragment.nodeType === 'sidebarCallout') {
    return extractSidebarCallout(fragment, bodyStyle, fragment.unitId, widthPx, theme);
  }

  return extractCustomAttributeSurfaces(fragment, theme, widthPx, typography, tocEntries);
}

function getUnitFragments(flow: LayoutFlowModel, unit: LayoutFlowUnit): LayoutFlowFragment[] {
  const nodeIdSet = new Set(unit.fragmentNodeIds);
  return flow.fragments.filter((fragment) => nodeIdSet.has(fragment.nodeId));
}

function applyUnitMinimums(fragments: LayoutFlowFragment[], heightPx: number): number {
  const nodeTypes = new Set(fragments.map((fragment) => fragment.nodeType));
  if (nodeTypes.has('chapterHeader')) return Math.max(220, heightPx);
  if (nodeTypes.has('statBlock')) return Math.max(260, heightPx);
  if (nodeTypes.has('npcProfile')) return Math.max(180, heightPx);
  if (nodeTypes.has('spellCard')) return Math.max(170, heightPx);
  if (nodeTypes.has('magicItem')) return Math.max(150, heightPx);
  if (nodeTypes.has('handout')) return Math.max(180, heightPx);
  if (nodeTypes.has('encounterTable')) return Math.max(180, heightPx);
  if (nodeTypes.has('randomTable')) return Math.max(150, heightPx);
  return Math.max(1, Math.ceil(heightPx));
}

function sumUnitMeasurementHeights(measurements: TextSurfaceMeasurement[]): number {
  return measurements.reduce((total, measurement) => total + measurement.totalHeightPx, 0);
}

export function buildFlowTextLayoutShadowTelemetry(args: {
  legacyMeasurements: MeasuredLayoutUnitMetric[];
  engineMeasurements: MeasuredLayoutUnitMetric[];
  engineTelemetry: FlowTextLayoutTelemetry;
  legacyPageCount: number;
  pretextPageCount: number;
}): FlowTextLayoutShadowTelemetry {
  const legacyByUnit = new Map(
    args.legacyMeasurements.map((measurement) => [measurement.unitId, measurement.heightPx] as const),
  );
  const totalHeightDeltaPx = args.engineMeasurements.reduce((total, measurement) => (
    total + Math.abs(measurement.heightPx - (legacyByUnit.get(measurement.unitId) ?? measurement.heightPx))
  ), 0);

  return {
    ...args.engineTelemetry,
    legacyPageCount: args.legacyPageCount,
    pretextPageCount: args.pretextPageCount,
    pageCountDelta: args.pretextPageCount - args.legacyPageCount,
    totalHeightDeltaPx,
  };
}

export function measureFlowTextUnits(
  flow: LayoutFlowModel,
  options: MeasureFlowTextUnitsOptions = {},
): FlowTextLayoutMeasurementResult {
  const typography = resolveThemeTypography(options.theme);
  const tocEntries = extractTocEntriesFromFlow(flow);
  const fallbackByUnit = new Map(
    (options.fallbackMeasurements ?? []).map((measurement) => [measurement.unitId, measurement.heightPx] as const),
  );
  const surfaces: TextLayoutSurface[] = [];
  const surfacesByUnit = new Map<string, TextLayoutSurface[]>();
  const supportedUnitIds = new Set<string>();
  const unsupportedUnitIds = new Set<string>();

  for (const unit of flow.units) {
    const fragments = getUnitFragments(flow, unit);
    const widthPx = resolveUnitWidth(flow, unit, options);

    if (unit.groupId) {
      unsupportedUnitIds.add(unit.id);
      continue;
    }

    const fragmentResults = fragments.map((fragment) => extractFragmentSurfaces(fragment, options.theme, widthPx, typography, tocEntries));
    const unitSurfaces = fragmentResults.flatMap((result) => result.surfaces);
    const supported = fragmentResults.length > 0 && fragmentResults.every((result) => result.supported);

    surfaces.push(...unitSurfaces);
    if (unitSurfaces.length > 0) {
      surfacesByUnit.set(unit.id, unitSurfaces);
    }

    if (supported && unitSurfaces.length > 0) {
      supportedUnitIds.add(unit.id);
    } else {
      unsupportedUnitIds.add(unit.id);
    }
  }

  const surfaceMeasurements = measureTextSurfaces(surfaces);
  const measurementsByUnit = new Map<string, TextSurfaceMeasurement[]>();
  for (const measurement of surfaceMeasurements) {
    const entry = measurementsByUnit.get(measurement.unitId) ?? [];
    entry.push(measurement);
    measurementsByUnit.set(measurement.unitId, entry);
  }

  const measurements: MeasuredLayoutUnitMetric[] = flow.units.map((unit) => {
    const fragments = getUnitFragments(flow, unit);
    if (supportedUnitIds.has(unit.id)) {
      const unitMeasurements = measurementsByUnit.get(unit.id) ?? [];
      return {
        unitId: unit.id,
        heightPx: applyUnitMinimums(fragments, sumUnitMeasurementHeights(unitMeasurements)),
      };
    }

    return {
      unitId: unit.id,
      heightPx: Math.max(
        1,
        Math.ceil(fallbackByUnit.get(unit.id) ?? estimateFlowUnitHeight(unit, flow.fragments)),
      ),
    };
  });

  return {
    measurements,
    surfaces,
    telemetry: {
      surfaceCount: surfaces.length,
      supportedSurfaceCount: surfaces.filter((surface) => surface.supportLevel === 'supported').length,
      unsupportedSurfaceCount: surfaces.filter((surface) => surface.supportLevel !== 'supported').length,
      supportedUnitCount: supportedUnitIds.size,
      unsupportedUnitCount: unsupportedUnitIds.size,
    },
    unsupportedUnitIds: [...unsupportedUnitIds],
  };
}
