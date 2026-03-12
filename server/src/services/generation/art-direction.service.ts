import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { DocumentContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';

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
  blockType: ImageCapableBlockType;
  nodeIndex: number;
  context: string;
}

const IMAGE_ATTR_BY_BLOCK: Record<ImageCapableBlockType, string> = {
  titlePage: 'coverImageUrl',
  chapterHeader: 'backgroundImage',
  fullBleedImage: 'src',
  mapBlock: 'src',
  backCover: 'authorImageUrl',
  npcProfile: 'portraitUrl',
};

const RECOMMENDED_MODEL_BY_BLOCK: Record<ImageCapableBlockType, 'dall-e-3' | 'gpt-image-1'> = {
  titlePage: 'dall-e-3',
  chapterHeader: 'dall-e-3',
  fullBleedImage: 'dall-e-3',
  mapBlock: 'gpt-image-1',
  backCover: 'dall-e-3',
  npcProfile: 'dall-e-3',
};

const RECOMMENDED_SIZE_BY_BLOCK: Record<ImageCapableBlockType, string> = {
  titlePage: '1024x1792',
  chapterHeader: '1792x1024',
  fullBleedImage: '1792x1024',
  mapBlock: '1024x1024',
  backCover: '1024x1024',
  npcProfile: '1024x1024',
};

const PlacementSchema = z.object({
  documentSlug: z.string(),
  nodeIndex: z.number().int().min(0),
  blockType: z.enum(['titlePage', 'chapterHeader', 'fullBleedImage', 'mapBlock', 'backCover', 'npcProfile']),
  prompt: z.string().min(20).max(4000),
  rationale: z.string().min(10).max(500),
  model: z.enum(['dall-e-3', 'gpt-image-1']),
  size: z.string().min(3).max(20),
});

const ArtDirectionPlanSchema = z.object({
  summary: z.string().min(10).max(1000),
  placements: z.array(PlacementSchema).max(6),
});

type ArtDirectionPlan = z.infer<typeof ArtDirectionPlanSchema>;

export interface ArtDirectionResult {
  artifactId: string | null;
  placementCount: number;
}

function getTopLevelNodes(content: DocumentContent | null | undefined): DocumentContent[] {
  return Array.isArray(content?.content) ? content.content : [];
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

export function collectImageSlots(
  documents: Array<{
    id: string;
    slug: string;
    title: string;
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
      const imagePrompt = String(attrs.imagePrompt || '').trim();

      if (imageUrl || imagePrompt) return;

      slots.push({
        documentId: document.id,
        documentSlug: document.slug,
        documentTitle: document.title,
        blockType,
        nodeIndex,
        context: buildSlotContext(nodes, nodeIndex),
      });
    });
  }

  return slots;
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

function buildSystemPrompt(): string {
  return `You are an art director for a professional D&D one-shot.

You receive a list of existing image slots already present in the document structure. Choose only the slots that most improve the final product. Favor:
- one strong cover image
- chapter banners for major sections
- one standout NPC portrait when a named NPC feels central
- a map only when the slot is already present and the content obviously benefits from it

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
      "model": "dall-e-3",
      "size": "1024x1792"
    }
  ]
}

Rules:
- Choose at most 4 placements
- Only use slots provided in the user message
- Do not invent document slugs or node indices
- Prefer DALL-E 3 for art and GPT Image 1 for maps or text-heavy diagrams
- Match the visual language of official D&D 5e books without naming copyrighted characters`;
}

function buildUserPrompt(input: {
  projectTitle: string;
  inputPrompt: string;
  includeMaps: boolean;
  slots: ImageSlot[];
}): string {
  const slotLines = input.slots.map((slot) => {
    const defaultModel = RECOMMENDED_MODEL_BY_BLOCK[slot.blockType];
    const defaultSize = RECOMMENDED_SIZE_BY_BLOCK[slot.blockType];
    return [
      `- documentSlug=${slot.documentSlug}`,
      `documentTitle="${slot.documentTitle}"`,
      `nodeIndex=${slot.nodeIndex}`,
      `blockType=${slot.blockType}`,
      `recommendedModel=${defaultModel}`,
      `recommendedSize=${defaultSize}`,
      `context="${slot.context || slot.documentTitle}"`,
    ].join(' | ');
  });

  return [
    `Project title: ${input.projectTitle}`,
    `Original prompt: ${input.inputPrompt}`,
    `Maps requested: ${input.includeMaps}`,
    '',
    'Available slots:',
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

export async function executeArtDirectionPass(
  run: {
    id: string;
    projectId: string;
    inputPrompt: string;
    inputParameters?: Record<string, unknown> | null;
  },
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<ArtDirectionResult> {
  const [project, documents] = await Promise.all([
    prisma.project.findUnique({
      where: { id: run.projectId },
      select: { title: true },
    }),
    prisma.projectDocument.findMany({
      where: { projectId: run.projectId, runId: run.id },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, slug: true, title: true, content: true },
    }),
  ]);

  if (!project || documents.length === 0) {
    return { artifactId: null, placementCount: 0 };
  }

  const slots = collectImageSlots(
    documents.map((document) => ({
      id: document.id,
      slug: document.slug,
      title: document.title,
      content: document.content as DocumentContent | null,
    })),
  );

  if (slots.length === 0) {
    return { artifactId: null, placementCount: 0 };
  }

  const { text, usage } = await generateText({
    model,
    system: buildSystemPrompt(),
    prompt: buildUserPrompt({
      projectTitle: project.title,
      inputPrompt: run.inputPrompt,
      includeMaps: Boolean(run.inputParameters?.includeMaps),
      slots,
    }),
    maxOutputTokens: Math.min(maxOutputTokens, 4096),
  });

  const parsed = parseJsonResponse(text);
  const plan = ArtDirectionPlanSchema.parse(parsed);
  const applicablePlacements = plan.placements.filter((placement) =>
    slots.some((slot) =>
      slot.documentSlug === placement.documentSlug &&
      slot.nodeIndex === placement.nodeIndex &&
      slot.blockType === placement.blockType,
    ),
  );

  const updatedDocuments = applyArtDirectionPlanToDocuments(
    documents.map((document) => ({
      id: document.id,
      slug: document.slug,
      content: document.content as DocumentContent | null,
    })),
    applicablePlacements,
  );

  await Promise.all(
    updatedDocuments.map((document) =>
      prisma.projectDocument.update({
        where: { id: document.id },
        data: { content: document.content as any },
      }),
    ),
  );

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

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
      } as any,
      markdownContent: buildMarkdown({
        ...plan,
        placements: applicablePlacements,
      }),
      tokenCount: totalTokens,
      metadata: {
        slotCount: slots.length,
        appliedPlacementCount: applicablePlacements.length,
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

  return { artifactId: artifact.id, placementCount: applicablePlacements.length };
}
