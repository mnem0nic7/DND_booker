import type { LanguageModel } from 'ai';
import { z } from 'zod';
import { normalizeChapterHeaderTitle, type DocumentContent, type DocumentKind } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import { getAiSettings, getDecryptedApiKey } from '../ai-settings.service.js';
import { generateAiImage, stripImageTextRenderingInstructions, type ImageModel } from '../ai-image.service.js';
import { createAsset } from '../asset.service.js';
import { generateTextWithTimeout } from './model-timeouts.js';
import { resolveDocumentLayout } from '../layout-plan.service.js';

type ImageCapableBlockType =
  | 'titlePage'
  | 'chapterHeader'
  | 'fullBleedImage'
  | 'mapBlock'
  | 'backCover'
  | 'npcProfile';

interface ImageSlot {
  documentId: string;
  documentSlug: string;
  documentTitle: string;
  kind?: DocumentKind | null;
  blockType: ImageCapableBlockType;
  nodeIndex: number;
  context: string;
  preferredModel?: ImageModel;
  preferredSize?: string;
}

interface AutomaticPlacementSeed {
  documentSlug: string;
  documentTitle: string;
  kind?: DocumentKind | null;
  nodeIndex: number;
  blockType: ImageCapableBlockType;
  context: string;
  model: string;
  size: string;
}

interface RealizedImagePlacement {
  documentSlug: string;
  nodeIndex: number;
  blockType: ImageCapableBlockType;
  prompt: string;
  model: string;
  size: string;
  assetId: string;
  assetUrl: string;
}

interface FailedImagePlacement {
  documentSlug: string;
  nodeIndex: number;
  blockType: ImageCapableBlockType;
  prompt: string;
  error: string;
}

const IMAGE_ATTR_BY_BLOCK: Record<ImageCapableBlockType, string> = {
  titlePage: 'coverImageUrl',
  chapterHeader: 'backgroundImage',
  fullBleedImage: 'src',
  mapBlock: 'src',
  backCover: 'authorImageUrl',
  npcProfile: 'portraitUrl',
};

const RECOMMENDED_MODEL_BY_BLOCK: Record<ImageCapableBlockType, ImageModel> = {
  titlePage: 'gpt-image-1',
  chapterHeader: 'gpt-image-1',
  fullBleedImage: 'gpt-image-1',
  mapBlock: 'gpt-image-1',
  backCover: 'gpt-image-1',
  npcProfile: 'gpt-image-1',
};

const RECOMMENDED_SIZE_BY_BLOCK: Record<ImageCapableBlockType, string> = {
  titlePage: '1024x1536',
  chapterHeader: '1536x1024',
  fullBleedImage: '1536x1024',
  mapBlock: '1024x1024',
  backCover: '1024x1024',
  npcProfile: '1024x1024',
};

const AUTO_ART_LIMIT_BY_BLOCK: Record<ImageCapableBlockType, number> = {
  titlePage: 1,
  chapterHeader: 8,
  fullBleedImage: 8,
  mapBlock: 2,
  backCover: 1,
  npcProfile: 4,
};

const AUTO_ART_PRIORITY: ImageCapableBlockType[] = [
  'titlePage',
  'chapterHeader',
  'fullBleedImage',
  'mapBlock',
  'npcProfile',
  'backCover',
];

const PlacementSchema = z.object({
  documentSlug: z.string(),
  nodeIndex: z.number().int().min(0),
  blockType: z.enum(['titlePage', 'chapterHeader', 'fullBleedImage', 'mapBlock', 'backCover', 'npcProfile']),
  prompt: z.string().min(20).max(4000),
  rationale: z.string().min(10).max(500),
  model: z.string().min(1).max(100),
  size: z.string().min(3).max(20),
});

const ArtDirectionPlanSchema = z.object({
  summary: z.string().min(10).max(1000),
  placements: z.array(PlacementSchema).max(20),
});

type ArtDirectionPlan = z.infer<typeof ArtDirectionPlanSchema>;

export interface ArtDirectionResult {
  artifactId: string | null;
  placementCount: number;
  generatedImageCount: number;
  failedImageCount: number;
  skippedImageGenerationReason: string | null;
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? '').trim();
}

function looksLikeWorkspaceTitle(value: string): boolean {
  const normalized = normalizeText(value).toLowerCase();
  return normalized.includes('workspace') || normalized.startsWith('untitled');
}

function isPlaceholderPublicationTitle(value: string): boolean {
  const normalized = normalizeText(value);
  return normalized.length === 0
    || normalized === 'Adventure Title'
    || normalized === 'One-Shot Title'
    || normalized === 'Campaign Title';
}

function resolvePublicationTitle(projectTitle: string, bibleTitle?: string | null): string {
  const preferredBibleTitle = normalizeText(bibleTitle);
  if (preferredBibleTitle) return preferredBibleTitle;
  return normalizeText(projectTitle);
}

function shouldAutoInsertFrontMatterToc(projectType: string | null | undefined, chapterLikeCount: number): boolean {
  if (projectType === 'one_shot') {
    return chapterLikeCount >= 5;
  }
  return chapterLikeCount >= 3;
}

function getTopLevelNodes(content: DocumentContent | null | undefined): DocumentContent[] {
  return Array.isArray(content?.content) ? content.content : [];
}

function documentContainsType(content: DocumentContent | null | undefined, targetType: string): boolean {
  if (!content) return false;
  if (content.type === targetType) return true;
  return (content.content ?? []).some((child) => documentContainsType(child, targetType));
}

function findFirstMeaningfulNodeIndex(nodes: DocumentContent[]): number {
  return nodes.findIndex((node) => node.type !== 'pageBreak' && node.type !== 'columnBreak');
}

function normalizeTitleForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function deriveChapterNumberLabel(title: string): string | null {
  const match = title.match(/chapter\s+\d+/i);
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

function stringifyNode(node: DocumentContent | null | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;

  const attrStrings = Object.values(node.attrs ?? {})
    .filter((value) => typeof value === 'string')
    .map((value) => String(value).trim())
    .filter(Boolean);

  const childText = Array.isArray(node.content)
    ? node.content.map((child) => stringifyNode(child)).join(' ')
    : '';

  return [...attrStrings, childText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function buildSlotContext(nodes: DocumentContent[], nodeIndex: number): string {
  const window = nodes.slice(Math.max(0, nodeIndex - 1), Math.min(nodes.length, nodeIndex + 3));
  return window
    .map((node) => stringifyNode(node))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 320);
}

function buildSlotKey(slot: {
  documentSlug: string;
  nodeIndex: number;
  blockType: ImageCapableBlockType;
}): string {
  return `${slot.documentSlug}:${slot.nodeIndex}:${slot.blockType}`;
}

function buildFallbackRationale(blockType: ImageCapableBlockType): string {
  switch (blockType) {
    case 'titlePage':
      return 'Creates an immediate professional first impression and gives the adventure a clear identity.';
    case 'chapterHeader':
      return 'Separates sections cleanly and gives each major beat a visual anchor.';
    case 'fullBleedImage':
      return 'Adds a strong scene illustration that breaks up dense text and improves page rhythm.';
    case 'mapBlock':
      return 'Gives the table a practical reference image for play instead of relying on prose alone.';
    case 'npcProfile':
      return 'Makes a named character easier to remember and faster to reference during play.';
    case 'backCover':
      return 'Provides a finished closing page instead of ending on plain texture and text alone.';
  }
}

function buildFallbackPrompt(input: {
  projectTitle: string;
  inputPrompt: string;
  includeMaps: boolean;
  slot: AutomaticPlacementSeed;
}): string {
  const projectTitle = input.projectTitle.trim();
  const context = (input.slot.context || input.slot.documentTitle || input.inputPrompt || projectTitle)
    .replace(/\s+/g, ' ')
    .trim();
  const sceneContext = context || input.inputPrompt || projectTitle;

  switch (input.slot.blockType) {
    case 'titlePage':
      return `Illustrated fantasy cover art for the Dungeons & Dragons adventure "${projectTitle}". Show ${sceneContext}. Painterly, dramatic lighting, rich atmosphere, publication-quality composition, no text, no watermark.`;
    case 'chapterHeader':
      return `Wide fantasy chapter banner illustration for the Dungeons & Dragons adventure "${projectTitle}", chapter "${input.slot.documentTitle}". Depict ${sceneContext}. Cinematic panoramic composition, readable negative space for title overlay, no text, no watermark.`;
    case 'fullBleedImage':
      return `Full-width fantasy illustration for the Dungeons & Dragons adventure "${projectTitle}". Depict ${sceneContext}. High-detail painterly scene art, dramatic lighting, no text, no watermark.`;
    case 'mapBlock':
      return `Top-down fantasy RPG map for the Dungeons & Dragons adventure "${projectTitle}". Show ${sceneContext}. Clear encounter layout, readable rooms and paths, parchment-ready styling, no labels outside the map artwork, no watermark.`;
    case 'npcProfile':
      return `Fantasy character portrait for the Dungeons & Dragons adventure "${projectTitle}". Character context: ${sceneContext}. Waist-up or bust portrait, expressive face, detailed costume, painterly style, neutral background or subtle environmental hint, no text, no watermark.`;
    case 'backCover':
      return `Atmospheric back-cover fantasy illustration for the Dungeons & Dragons adventure "${projectTitle}". Evoke ${sceneContext}. Elegant, moody, uncluttered composition suitable for a book back cover, no text, no watermark.`;
  }
}

function buildFallbackSummary(projectTitle: string, placements: AutomaticPlacementSeed[]): string {
  return `Automatic art package for "${projectTitle}" covering ${placements.length} visual slot(s) across the generated adventure.`;
}

function buildGlobalArtDirectionSuffix(): string {
  return 'Cohesive premium fantasy book illustration style, grounded D&D adventure tone, painterly finish, strong focal composition, no text, no lettering, no typography, no logo, no watermark.';
}

function buildBlockSpecificSuffix(blockType: ImageCapableBlockType): string {
  switch (blockType) {
    case 'titlePage':
      return 'Cover composition only; do not depict a printed title or any written words in the artwork.';
    case 'chapterHeader':
      return 'Wide chapter-banner composition with restrained detail through the central title zone and clear negative space for overlaid chapter text.';
    case 'fullBleedImage':
      return 'Full-width scene art with readable silhouettes and controlled detail, suitable for book layout.';
    case 'mapBlock':
      return 'Functional top-down encounter map with readable spaces and paths, but no decorative title text.';
    case 'npcProfile':
      return 'Portrait-focused composition with the face clearly readable and background kept secondary.';
    case 'backCover':
      return 'Back-cover-safe composition with elegant atmosphere and no typography.';
  }
}

export function finalizeArtPrompt(prompt: string, blockType: ImageCapableBlockType): string {
  const cleaned = stripImageTextRenderingInstructions(prompt)
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim()
    .replace(/[.;,\s]+$/g, '');

  return [
    cleaned,
    buildBlockSpecificSuffix(blockType),
    buildGlobalArtDirectionSuffix(),
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function collectImageSlots(
  documents: Array<{
    id: string;
    slug: string;
    title: string;
    kind?: DocumentKind | null;
    content: DocumentContent | null;
  }>,
): ImageSlot[] {
  const slots: ImageSlot[] = [];

  for (const document of documents) {
    const nodes = getTopLevelNodes(document.content);

    nodes.forEach((node, nodeIndex) => {
      const blockType = node.type as ImageCapableBlockType;
      if (!(blockType in IMAGE_ATTR_BY_BLOCK)) return;

      const attrs = (node.attrs ?? {}) as Record<string, unknown>;
      const imageUrl = String(attrs[IMAGE_ATTR_BY_BLOCK[blockType]] || '').trim();
      if (imageUrl) return;

      const preferredModel = String((node.attrs ?? {}).imageGenerationModel || '').trim();
      const preferredSize = String((node.attrs ?? {}).imageGenerationSize || '').trim();
      slots.push({
        documentId: document.id,
        documentSlug: document.slug,
        documentTitle: document.title,
        kind: document.kind ?? null,
        blockType,
        nodeIndex,
        context: buildSlotContext(nodes, nodeIndex),
        preferredModel: preferredModel === 'dall-e-3' || preferredModel === 'gpt-image-1'
          ? preferredModel
          : undefined,
        preferredSize: preferredSize || undefined,
      });
    });
  }

  return slots;
}

export function selectAutomaticArtSlots(
  slots: ImageSlot[],
  options: { includeMaps: boolean },
): AutomaticPlacementSeed[] {
  const selected: AutomaticPlacementSeed[] = [];
  const selectedKeys = new Set<string>();
  const counts: Partial<Record<ImageCapableBlockType, number>> = {};

  const maybeAddSlot = (slot: ImageSlot) => {
    if (slot.blockType === 'mapBlock' && !options.includeMaps) {
      return;
    }

    const key = buildSlotKey(slot);
    if (selectedKeys.has(key)) {
      return;
    }

    const currentCount = counts[slot.blockType] ?? 0;
    const limit = AUTO_ART_LIMIT_BY_BLOCK[slot.blockType];
    if (currentCount >= limit) {
      return;
    }

    selected.push({
      documentSlug: slot.documentSlug,
      documentTitle: slot.documentTitle,
      kind: slot.kind ?? null,
      nodeIndex: slot.nodeIndex,
      blockType: slot.blockType,
      context: slot.context,
      model: slot.preferredModel ?? RECOMMENDED_MODEL_BY_BLOCK[slot.blockType],
      size: slot.preferredSize ?? RECOMMENDED_SIZE_BY_BLOCK[slot.blockType],
    });
    selectedKeys.add(key);
    counts[slot.blockType] = currentCount + 1;
  };

  for (const blockType of AUTO_ART_PRIORITY) {
    slots
      .filter((slot) => slot.blockType === blockType)
      .forEach(maybeAddSlot);
  }

  return selected;
}

function applyPromptToNode(node: DocumentContent, nodeIndex: number, prompt: string): DocumentContent {
  const nodes = getTopLevelNodes(node);
  if (!Array.isArray(node.content) || !nodes[nodeIndex]) return node;

  const nextNodes = nodes.map((child, index) => {
    if (index !== nodeIndex) return child;
    return {
      ...child,
      attrs: {
        ...(child.attrs ?? {}),
        imagePrompt: prompt,
      },
    };
  });

  return {
    ...node,
    content: nextNodes,
  };
}

export function applyArtDirectionPlanToDocuments(
  documents: Array<{
    id: string;
    slug: string;
    content: DocumentContent | null;
  }>,
  placements: ArtDirectionPlan['placements'],
): Array<{ id: string; content: DocumentContent | null }> {
  const promptsByDocument = new Map<string, ArtDirectionPlan['placements']>();

  for (const placement of placements) {
    const bucket = promptsByDocument.get(placement.documentSlug) ?? [];
    bucket.push(placement);
    promptsByDocument.set(placement.documentSlug, bucket);
  }

  return documents.map((document) => {
    const placementsForDoc = promptsByDocument.get(document.slug);
    if (!placementsForDoc || !document.content) {
      return { id: document.id, content: document.content };
    }

    const nextContent = placementsForDoc.reduce(
      (current, placement) => applyPromptToNode(current, placement.nodeIndex, placement.prompt),
      document.content,
    );

    return { id: document.id, content: nextContent };
  });
}

export function ensureTitlePageSlot(content: DocumentContent | null, projectTitle: string): DocumentContent {
  const nodes = getTopLevelNodes(content);
  if (nodes.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'titlePage', attrs: { title: projectTitle, coverImageUrl: '', imagePrompt: '' } }],
    };
  }

  if (documentContainsType(content, 'titlePage')) {
    return {
      type: 'doc',
      content: nodes.map((node) => {
        if (node.type !== 'titlePage') return node;

        const currentTitle = normalizeText(String(node.attrs?.title || ''));
        if (!isPlaceholderPublicationTitle(currentTitle) && !looksLikeWorkspaceTitle(currentTitle)) {
          return node;
        }

        return {
          ...node,
          attrs: {
            ...(node.attrs ?? {}),
            title: projectTitle,
          },
        };
      }),
    };
  }

  return {
    type: 'doc',
    content: [
      { type: 'titlePage', attrs: { title: projectTitle, coverImageUrl: '', imagePrompt: '' } },
      ...nodes,
    ],
  };
}

export function ensureChapterHeaderImageSlot(
  content: DocumentContent | null,
  documentTitle: string,
): DocumentContent {
  const nodes = getTopLevelNodes(content);
  const chapterNumber = deriveChapterNumberLabel(documentTitle);

  if (documentContainsType(content, 'chapterHeader')) {
    return (content ?? { type: 'doc', content: [] }) as DocumentContent;
  }

  const chapterHeaderNode: DocumentContent = {
    type: 'chapterHeader',
    attrs: {
      title: normalizeChapterHeaderTitle(documentTitle, chapterNumber ?? ''),
      chapterNumber: chapterNumber ?? undefined,
      backgroundImage: '',
      imagePrompt: '',
    },
  };

  if (nodes.length === 0) {
    return { type: 'doc', content: [chapterHeaderNode] };
  }

  const firstMeaningfulIndex = findFirstMeaningfulNodeIndex(nodes);
  if (firstMeaningfulIndex >= 0) {
    const firstMeaningfulNode = nodes[firstMeaningfulIndex];
    if (firstMeaningfulNode.type === 'heading' && Number(firstMeaningfulNode.attrs?.level ?? 0) === 1) {
      const headingText = normalizeTitleForComparison(stringifyNode(firstMeaningfulNode));
      const documentText = normalizeTitleForComparison(normalizeChapterHeaderTitle(documentTitle, chapterNumber ?? ''));
      if (headingText === documentText || headingText.includes(documentText) || documentText.includes(headingText)) {
        return {
          type: 'doc',
          content: nodes.map((node, index) => (index === firstMeaningfulIndex ? chapterHeaderNode : node)),
        };
      }
    }
  }

  return {
    type: 'doc',
    content: [chapterHeaderNode, ...nodes],
  };
}

async function ensureArtDirectionReadyDocuments(input: {
  runId: string;
  projectId: string;
  projectTitle: string;
  projectType: string | null | undefined;
  documents: Array<{
    id: string;
    slug: string;
    title: string;
    kind?: DocumentKind | null;
    sortOrder: number;
    content: DocumentContent | null;
  }>;
}): Promise<Array<{
  id: string;
  slug: string;
  title: string;
  kind?: DocumentKind | null;
  sortOrder: number;
  layoutPlan?: unknown;
  content: DocumentContent | null;
}>> {
  let documents = [...input.documents];
  const chapterLikeCount = documents.filter((doc) => doc.kind === 'chapter' || doc.kind === 'appendix').length;

  if (!documents.some((doc) => doc.kind === 'front_matter')) {
    const frontMatterContent: DocumentContent = {
      type: 'doc',
      content: [
        { type: 'titlePage', attrs: { title: input.projectTitle, coverImageUrl: '', imagePrompt: '' } },
        ...(shouldAutoInsertFrontMatterToc(input.projectType, chapterLikeCount)
          ? [{ type: 'tableOfContents', attrs: { title: 'Table of Contents', depth: 1 } }]
          : []),
      ],
    };
    const resolvedLayout = resolveDocumentLayout({
      content: frontMatterContent,
      kind: 'front_matter',
      title: 'Front Matter',
    });
    const frontMatterDoc = await prisma.projectDocument.create({
      data: {
        projectId: input.projectId,
        runId: input.runId,
        kind: 'front_matter',
        title: 'Front Matter',
        slug: 'front-matter',
        sortOrder: Math.min(...documents.map((doc) => doc.sortOrder), 0) - 1,
        targetPageCount: null,
        status: 'draft',
        sourceArtifactId: null,
        layoutPlan: resolvedLayout.layoutPlan as any,
        content: resolvedLayout.content as any,
      },
      select: { id: true, slug: true, title: true, kind: true, sortOrder: true, layoutPlan: true, content: true },
    });

    documents = [frontMatterDoc as typeof documents[number], ...documents];
  }

  const nextDocuments = await Promise.all(documents.map(async (document) => {
    let nextContent = document.content as DocumentContent | null;

    if (document.kind === 'front_matter') {
      nextContent = ensureTitlePageSlot(nextContent, input.projectTitle);
    } else if (document.kind === 'chapter' || document.kind === 'appendix') {
      nextContent = ensureChapterHeaderImageSlot(nextContent, document.title);
    }

    const changed = JSON.stringify(nextContent) !== JSON.stringify(document.content);
    if (changed) {
      const resolvedLayout = resolveDocumentLayout({
        content: nextContent,
        layoutPlan: (document as { layoutPlan?: unknown }).layoutPlan ?? null,
        kind: document.kind,
        title: document.title,
      });
      await prisma.projectDocument.update({
        where: { id: document.id },
        data: {
          content: resolvedLayout.content as any,
          layoutPlan: resolvedLayout.layoutPlan as any,
        },
      });
    }

    return {
      ...document,
      content: nextContent,
    };
  }));

  return nextDocuments;
}

function sanitizeAssetBaseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'art';
}

function normalizeComparableLabel(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function extractPlacementSubject(blockType: ImageCapableBlockType, prompt: string): string {
  if (blockType === 'npcProfile') {
    const match = prompt.match(/^([^,.]+?)(?:,|\.)/);
    return match?.[1]?.trim() ?? '';
  }

  if (blockType === 'mapBlock' || blockType === 'fullBleedImage' || blockType === 'chapterHeader') {
    const quoted = prompt.match(/"([^"]+)"/);
    return quoted?.[1]?.trim() ?? '';
  }

  return '';
}

function resolvePlacementNodeIndex(
  content: DocumentContent,
  placement: Pick<RealizedImagePlacement, 'nodeIndex' | 'blockType' | 'prompt' | 'assetUrl'>,
): number {
  const nodes = getTopLevelNodes(content);
  const imageAttr = IMAGE_ATTR_BY_BLOCK[placement.blockType];
  const exactNode = nodes[placement.nodeIndex];

  if (exactNode?.type === placement.blockType) {
    return placement.nodeIndex;
  }

  const subjectHint = normalizeComparableLabel(extractPlacementSubject(placement.blockType, placement.prompt));
  const candidates = nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) => node.type === placement.blockType)
    .map(({ node, index }) => {
      const label = normalizeComparableLabel(
        String(node.attrs?.name || node.attrs?.title || node.attrs?.chapterTitle || ''),
      );
      const currentImage = String(node.attrs?.[imageAttr] || '').trim();
      const matchesSubject = Boolean(subjectHint) && label.includes(subjectHint);
      const isEmptySlot = !currentImage;
      const alreadyApplied = currentImage === placement.assetUrl;
      return {
        index,
        matchesSubject,
        isEmptySlot,
        alreadyApplied,
        distance: Math.abs(index - placement.nodeIndex),
      };
    })
    .sort((left, right) => {
      if (left.matchesSubject !== right.matchesSubject) return left.matchesSubject ? -1 : 1;
      if (left.isEmptySlot !== right.isEmptySlot) return left.isEmptySlot ? -1 : 1;
      if (left.alreadyApplied !== right.alreadyApplied) return left.alreadyApplied ? -1 : 1;
      return left.distance - right.distance;
    });

  return candidates[0]?.index ?? placement.nodeIndex;
}

function applyImageToNode(
  content: DocumentContent,
  nodeIndex: number,
  blockType: ImageCapableBlockType,
  prompt: string,
  assetId: string,
  assetUrl: string,
): DocumentContent {
  const nodes = getTopLevelNodes(content);
  if (!Array.isArray(content.content) || nodes.length === 0) return content;

  const resolvedNodeIndex = resolvePlacementNodeIndex(content, {
    nodeIndex,
    blockType,
    prompt,
    assetUrl,
  });

  if (!nodes[resolvedNodeIndex]) return content;

  const nextNodes = nodes.map((child, index) => {
    if (index !== resolvedNodeIndex) return child;
    return {
      ...child,
      attrs: {
        ...(child.attrs ?? {}),
        [IMAGE_ATTR_BY_BLOCK[blockType]]: assetUrl,
        imagePrompt: prompt,
        imageAssetId: assetId,
      },
    };
  });

  return {
    ...content,
    content: nextNodes,
  };
}

export function applyRealizedArtToDocuments(
  documents: Array<{
    id: string;
    slug: string;
    content: DocumentContent | null;
  }>,
  placements: RealizedImagePlacement[],
): Array<{ id: string; content: DocumentContent | null }> {
  const placementsByDocument = new Map<string, RealizedImagePlacement[]>();

  for (const placement of placements) {
    const bucket = placementsByDocument.get(placement.documentSlug) ?? [];
    bucket.push(placement);
    placementsByDocument.set(placement.documentSlug, bucket);
  }

  return documents.map((document) => {
    const placementsForDoc = placementsByDocument.get(document.slug);
    if (!placementsForDoc || !document.content) {
      return { id: document.id, content: document.content };
    }

    const nextContent = placementsForDoc.reduce(
      (current, placement) => applyImageToNode(
        current,
        placement.nodeIndex,
        placement.blockType,
        placement.prompt,
        placement.assetId,
        placement.assetUrl,
      ),
      document.content,
    );

    return { id: document.id, content: nextContent };
  });
}

async function realizeArtPlacements(input: {
  userId: string;
  projectId: string;
  placements: ArtDirectionPlan['placements'];
}): Promise<{
  successfulPlacements: RealizedImagePlacement[];
  failedPlacements: FailedImagePlacement[];
  skippedReason: string | null;
}> {
  if (input.placements.length === 0) {
    return { successfulPlacements: [], failedPlacements: [], skippedReason: null };
  }

  const settings = await getAiSettings(input.userId);
  if (!settings?.provider || (settings.provider !== 'openai' && settings.provider !== 'google') || !settings.hasApiKey) {
    return {
      successfulPlacements: [],
      failedPlacements: [],
      skippedReason: 'Automatic image generation requires OpenAI or Google Gemini AI settings with a saved API key.',
    };
  }

  const apiKey = await getDecryptedApiKey(input.userId);
  if (!apiKey) {
    return {
      successfulPlacements: [],
      failedPlacements: [],
      skippedReason: 'OpenAI API key could not be decrypted for automatic image generation.',
    };
  }

  const successfulPlacements: RealizedImagePlacement[] = [];
  const failedPlacements: FailedImagePlacement[] = [];

  for (const placement of input.placements) {
    try {
      const image = await generateAiImage(apiKey, {
        provider: settings.provider,
        prompt: placement.prompt,
        model: placement.model,
        size: placement.size,
      });
      const buffer = Buffer.from(image.base64, 'base64');
      const filename = `${sanitizeAssetBaseName(placement.documentSlug)}-${placement.blockType}-${placement.nodeIndex + 1}.png`;
      const asset = await createAsset(input.projectId, input.userId, {
        originalname: filename,
        mimetype: image.mimeType,
        size: buffer.length,
        buffer,
      });

      if (!asset) {
        throw new Error('Asset storage rejected the generated image.');
      }

      successfulPlacements.push({
        documentSlug: placement.documentSlug,
        nodeIndex: placement.nodeIndex,
        blockType: placement.blockType,
        prompt: placement.prompt,
        model: placement.model,
        size: placement.size,
        assetId: asset.id,
        assetUrl: asset.url,
      });
    } catch (error) {
      failedPlacements.push({
        documentSlug: placement.documentSlug,
        nodeIndex: placement.nodeIndex,
        blockType: placement.blockType,
        prompt: placement.prompt,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    successfulPlacements,
    failedPlacements,
    skippedReason: null,
  };
}

function buildSystemPrompt(selectedPlacementCount: number): string {
  return `You are an art director for a professional D&D one-shot.

You receive a list of image slots already selected by the system. Your job is to write the best prompt package for those exact slots. Do not choose a subset. Do not invent extra slots. Return exactly ${selectedPlacementCount} placements, one for each provided slot.

Return ONLY valid JSON with this shape:
{
  "summary": "short summary of the recommended art package",
  "placements": [
    {
      "documentSlug": "front-matter",
      "nodeIndex": 0,
      "blockType": "titlePage",
      "prompt": "detailed image prompt",
      "rationale": "why this image matters",
      "model": "gpt-image-1",
      "size": "1024x1536"
    }
  ]
}

Rules:
- Use every slot provided in the user message exactly once
- Preserve the provided documentSlug, nodeIndex, blockType, model, and size
- Do not invent document slugs or node indices
- Do not skip slots
- Never ask for titles, labels, captions, logos, typography, or any visible words inside the image
- For chapterHeader images, reserve clean negative space where chapter text will be overlaid
- Keep the images visually cohesive, like one premium adventure product line
- Match the visual language of official D&D 5e books without naming copyrighted characters`;
}

function buildUserPrompt(input: {
  projectTitle: string;
  inputPrompt: string;
  includeMaps: boolean;
  placements: AutomaticPlacementSeed[];
}): string {
  const slotLines = input.placements.map((slot) => {
    return [
      `- documentSlug=${slot.documentSlug}`,
      `documentTitle="${slot.documentTitle}"`,
      `nodeIndex=${slot.nodeIndex}`,
      `blockType=${slot.blockType}`,
      `recommendedModel=${slot.model}`,
      `recommendedSize=${slot.size}`,
      `context="${slot.context || slot.documentTitle}"`,
    ].join(' | ');
  });

  return [
    `Project title: ${input.projectTitle}`,
    `Original prompt: ${input.inputPrompt}`,
    `Maps requested: ${input.includeMaps}`,
    '',
    'Selected slots requiring image prompts:',
    ...slotLines,
  ].join('\n');
}

function buildMarkdown(plan: ArtDirectionPlan): string {
  const placements = plan.placements.length > 0
    ? plan.placements.map((placement) => [
        `- ${placement.blockType} in \`${placement.documentSlug}\` at node ${placement.nodeIndex}`,
        `  - Model: ${placement.model}`,
        `  - Size: ${placement.size}`,
        `  - Why: ${placement.rationale}`,
        `  - Prompt: ${placement.prompt}`,
      ].join('\n')).join('\n')
    : '- No art placements recommended.';

  return [
    '# Art Direction Plan',
    '',
    plan.summary,
    '',
    '## Placements',
    placements,
  ].join('\n');
}

function materializeAutomaticPlan(input: {
  projectTitle: string;
  inputPrompt: string;
  includeMaps: boolean;
  seeds: AutomaticPlacementSeed[];
  candidatePlan: ArtDirectionPlan | null;
}): ArtDirectionPlan {
  const placementsByKey = new Map<string, ArtDirectionPlan['placements'][number]>();

  for (const placement of input.candidatePlan?.placements ?? []) {
    placementsByKey.set(buildSlotKey(placement), placement);
  }

  const placements = input.seeds.map((seed) => {
    const candidate = placementsByKey.get(buildSlotKey(seed));
    const basePrompt = candidate?.prompt?.trim() || buildFallbackPrompt({
      projectTitle: input.projectTitle,
      inputPrompt: input.inputPrompt,
      includeMaps: input.includeMaps,
      slot: seed,
    });

    return {
      documentSlug: seed.documentSlug,
      nodeIndex: seed.nodeIndex,
      blockType: seed.blockType,
      prompt: finalizeArtPrompt(basePrompt, seed.blockType),
      rationale: candidate?.rationale?.trim() || buildFallbackRationale(seed.blockType),
      model: seed.model,
      size: seed.size,
    };
  });

  return {
    summary: input.candidatePlan?.summary?.trim() || buildFallbackSummary(input.projectTitle, input.seeds),
    placements,
  };
}

export async function executeArtDirectionPass(
  run: {
    id: string;
    projectId: string;
    userId: string;
    inputPrompt: string;
    inputParameters?: Record<string, unknown> | null;
  },
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<ArtDirectionResult> {
  const [project, bible, documents] = await Promise.all([
    prisma.project.findUnique({
      where: { id: run.projectId },
      select: { title: true, type: true },
    }),
    prisma.campaignBible.findFirst({
      where: { runId: run.id, projectId: run.projectId },
      orderBy: { createdAt: 'desc' },
      select: { title: true },
    }),
    prisma.projectDocument.findMany({
      where: { projectId: run.projectId, runId: run.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, title: true, kind: true, sortOrder: true, layoutPlan: true, content: true },
    }),
  ]);

  if (!project || documents.length === 0) {
    return {
      artifactId: null,
      placementCount: 0,
      generatedImageCount: 0,
      failedImageCount: 0,
      skippedImageGenerationReason: null,
    };
  }

  const publicationTitle = resolvePublicationTitle(project.title, bible?.title);

  const artReadyDocuments = await ensureArtDirectionReadyDocuments({
    runId: run.id,
    projectId: run.projectId,
    projectTitle: publicationTitle,
    projectType: project.type,
    documents: documents.map((document) => ({
      id: document.id,
      slug: document.slug,
      title: document.title,
      kind: document.kind as DocumentKind | null,
      sortOrder: document.sortOrder,
      content: document.content as DocumentContent | null,
    })),
  });

  const slots = collectImageSlots(
    artReadyDocuments.map((document) => ({
      id: document.id,
      slug: document.slug,
      title: document.title,
      kind: document.kind ?? null,
      content: document.content,
    })),
  );

  const selectedSlots = selectAutomaticArtSlots(slots, {
    includeMaps: Boolean(run.inputParameters?.includeMaps),
  });

  if (selectedSlots.length === 0) {
    return {
      artifactId: null,
      placementCount: 0,
      generatedImageCount: 0,
      failedImageCount: 0,
      skippedImageGenerationReason: null,
    };
  }

  let candidatePlan: ArtDirectionPlan | null = null;
  let totalTokens = 0;

  try {
    const { text, usage } = await generateTextWithTimeout('Art direction prompt generation', {
      model,
      system: buildSystemPrompt(selectedSlots.length),
      prompt: buildUserPrompt({
        projectTitle: publicationTitle,
        inputPrompt: run.inputPrompt,
        includeMaps: Boolean(run.inputParameters?.includeMaps),
        placements: selectedSlots,
      }),
      maxOutputTokens: Math.min(maxOutputTokens, 4096),
    });

    totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
    const parsed = parseJsonResponse(text);
    candidatePlan = ArtDirectionPlanSchema.parse(parsed);
  } catch {
    candidatePlan = null;
  }

  const plan = materializeAutomaticPlan({
    projectTitle: publicationTitle,
    inputPrompt: run.inputPrompt,
    includeMaps: Boolean(run.inputParameters?.includeMaps),
    seeds: selectedSlots,
    candidatePlan,
  });
  const applicablePlacements = plan.placements;

  const promptUpdatedDocuments = applyArtDirectionPlanToDocuments(
    artReadyDocuments.map((document) => ({
      id: document.id,
      slug: document.slug,
      content: document.content,
    })),
    applicablePlacements,
  );

  const realized = await realizeArtPlacements({
    userId: run.userId,
    projectId: run.projectId,
    placements: applicablePlacements,
  });

  const fullyUpdatedDocuments = applyRealizedArtToDocuments(
    promptUpdatedDocuments.map((document) => ({
      id: document.id,
      slug: artReadyDocuments.find((candidate) => candidate.id === document.id)?.slug ?? '',
      content: document.content,
    })),
    realized.successfulPlacements,
  );

  await Promise.all(
    fullyUpdatedDocuments.map((document) => {
      const existing = artReadyDocuments.find((candidate) => candidate.id === document.id);
      const resolvedLayout = resolveDocumentLayout({
        content: document.content,
        layoutPlan: (existing as { layoutPlan?: unknown } | undefined)?.layoutPlan ?? null,
        kind: existing?.kind ?? null,
        title: existing?.title ?? null,
      });
      return prisma.projectDocument.update({
        where: { id: document.id },
        data: {
          content: resolvedLayout.content as any,
          layoutPlan: resolvedLayout.layoutPlan as any,
        },
      });
    }),
  );

  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'art_direction_plan',
      artifactKey: 'art-direction-plan',
      status: 'accepted',
      version: 1,
      title: 'Art Direction Plan',
      summary: plan.summary,
      jsonContent: {
        ...plan,
        placements: applicablePlacements,
        generatedImages: realized.successfulPlacements,
        failedImagePlacements: realized.failedPlacements,
        skippedImageGenerationReason: realized.skippedReason,
      } as any,
      markdownContent: buildMarkdown({
        ...plan,
        placements: applicablePlacements,
      }),
      tokenCount: totalTokens,
      metadata: {
        slotCount: slots.length,
        selectedPlacementCount: selectedSlots.length,
        appliedPlacementCount: applicablePlacements.length,
        generatedImageCount: realized.successfulPlacements.length,
        failedImageCount: realized.failedPlacements.length,
        skippedImageGenerationReason: realized.skippedReason,
        selectionMode: 'automatic',
      } as any,
    },
  });

  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'art_direction_plan',
    title: artifact.title,
    version: artifact.version,
  });

  return {
    artifactId: artifact.id,
    placementCount: applicablePlacements.length,
    generatedImageCount: realized.successfulPlacements.length,
    failedImageCount: realized.failedPlacements.length,
    skippedImageGenerationReason: realized.skippedReason,
  };
}
