import type { ChapterOutline, AssemblyDocumentSpec } from '@dnd-booker/shared';
import { ArtifactStatus, Prisma } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { resolveOutlineArtifact } from './outline-artifact.service.js';
import { resolveDocumentLayout } from '../layout-plan.service.js';
import { buildPublicationDocumentStorageFields } from '../document-publication.service.js';
import { rebuildProjectContentCache } from '../project-document-content.service.js';
import { convertMarkdownToTipTapWithTimeout } from './markdown-artifact-conversion.service.js';
import { applyRealizedArtToDocuments } from './art-direction.service.js';
import type { ImageModel } from '../ai-image.service.js';
import {
  extractMarkdownFromWrappedCodeBlock,
  normalizeGeneratedMarkdown,
} from './markdown-normalizer.js';

export interface AssemblyResult {
  manifestId: string;
  documentIds: string[];
}

interface RealizedArtPlacement {
  documentSlug: string;
  nodeIndex: number;
  blockType: 'titlePage' | 'chapterHeader' | 'fullBleedImage' | 'mapBlock' | 'backCover' | 'npcProfile';
  prompt: string;
  model: ImageModel;
  size: string;
  assetId: string;
  assetUrl: string;
}

const ASSEMBLY_MARKDOWN_CONVERSION_TIMEOUT_MS = 120_000;
const ASSEMBLY_FALLBACK_CONTENT_STATUSES: readonly ArtifactStatus[] = [
  'generated',
  'failed_evaluation',
  'needs_review',
  'revising',
  'passed',
  'evaluating',
] as const;

async function findFallbackArtifacts(runId: string, artifactKey: string, statuses: readonly ArtifactStatus[]) {
  const artifacts = await prisma.generatedArtifact.findMany({
    where: {
      runId,
      artifactKey,
    },
    orderBy: { version: 'desc' },
  });

  return artifacts.filter((artifact) => statuses.includes(artifact.status as ArtifactStatus));
}

async function resolveArtifactContent(
  artifact: {
    id: string;
    title: string;
    markdownContent: string | null;
    tiptapContent: unknown;
    jsonContent: unknown;
  } | undefined,
): Promise<unknown> {
  if (!artifact) {
    return {};
  }

  const recoveredMarkdownFromTipTap = extractMarkdownFromWrappedCodeBlock(artifact.tiptapContent);
  if (artifact.tiptapContent && !recoveredMarkdownFromTipTap) {
    return artifact.tiptapContent;
  }

  const normalizedMarkdown = artifact.markdownContent
    ? normalizeGeneratedMarkdown(artifact.markdownContent)
    : recoveredMarkdownFromTipTap;

  if (normalizedMarkdown) {
    const tiptapContent = await convertMarkdownToTipTapWithTimeout(
      normalizedMarkdown,
      `Assembly conversion for ${artifact.title}`,
      ASSEMBLY_MARKDOWN_CONVERSION_TIMEOUT_MS,
    );

    const nextData: Record<string, unknown> = {
      tiptapContent: tiptapContent as any,
    };
    if (artifact.markdownContent && artifact.markdownContent !== normalizedMarkdown) {
      nextData.markdownContent = normalizedMarkdown;
    }

    await prisma.generatedArtifact.update({
      where: { id: artifact.id },
      data: nextData,
    });

    return tiptapContent;
  }

  return artifact.jsonContent ?? {};
}

// Map artifact types to document kinds
const ARTIFACT_TO_DOC_KIND: Record<string, 'front_matter' | 'chapter' | 'appendix' | 'back_matter'> = {
  front_matter_draft: 'front_matter',
  chapter_draft: 'chapter',
  appendix_draft: 'appendix',
};

/**
 * Get the latest accepted version of each artifact key for a run.
 */
async function getAcceptedArtifacts(runId: string) {
  const artifacts = await prisma.generatedArtifact.findMany({
    where: { runId, status: 'accepted' },
    orderBy: [{ artifactKey: 'asc' }, { version: 'desc' }],
  });

  // Deduplicate: keep only latest version per artifactKey
  const seen = new Set<string>();
  return artifacts.filter((a) => {
    if (seen.has(a.artifactKey)) return false;
    seen.add(a.artifactKey);
    return true;
  });
}

type AssemblyArtifact = Awaited<ReturnType<typeof getAcceptedArtifacts>>[number];

function hasRecoverableArtifactContent(artifact: Pick<AssemblyArtifact, 'markdownContent' | 'tiptapContent' | 'jsonContent'>): boolean {
  const recoveredMarkdownFromTipTap = extractMarkdownFromWrappedCodeBlock(artifact.tiptapContent);
  if (artifact.tiptapContent && !recoveredMarkdownFromTipTap) {
    return true;
  }

  if (artifact.markdownContent && normalizeGeneratedMarkdown(artifact.markdownContent)) {
    return true;
  }

  if (recoveredMarkdownFromTipTap) {
    return true;
  }

  return Boolean(
    artifact.jsonContent
    && typeof artifact.jsonContent === 'object'
    && !Array.isArray(artifact.jsonContent)
    && (artifact.jsonContent as { type?: unknown }).type === 'doc',
  );
}

function resolvePrimaryDraftKey(spec: AssemblyDocumentSpec): string | null {
  switch (spec.kind) {
    case 'front_matter':
      return 'front-matter';
    case 'chapter':
      return `chapter-draft-${spec.documentSlug}`;
    case 'appendix':
      return `appendix-draft-${spec.documentSlug}`;
    default:
      return null;
  }
}

async function resolveAssemblySourceArtifact(
  runId: string,
  spec: AssemblyDocumentSpec,
  acceptedByKey: Map<string, AssemblyArtifact>,
): Promise<{ artifact: AssemblyArtifact | null; accepted: boolean }> {
  const primaryDraftKey = resolvePrimaryDraftKey(spec);
  if (primaryDraftKey) {
    const acceptedDraft = acceptedByKey.get(primaryDraftKey);
    if (acceptedDraft) {
      return { artifact: acceptedDraft, accepted: true };
    }

    const fallbackArtifacts = await findFallbackArtifacts(
      runId,
      primaryDraftKey,
      ASSEMBLY_FALLBACK_CONTENT_STATUSES,
    );

    const fallback = fallbackArtifacts.find(hasRecoverableArtifactContent) ?? null;
    if (fallback) {
      return { artifact: fallback, accepted: false };
    }
  }

  for (const key of spec.artifactKeys) {
    const accepted = acceptedByKey.get(key);
    if (accepted) {
      return { artifact: accepted, accepted: true };
    }
  }

  return { artifact: null, accepted: false };
}

async function getAcceptedGeneratedImages(runId: string): Promise<RealizedArtPlacement[]> {
  const artifact = await prisma.generatedArtifact.findFirst({
    where: {
      runId,
      artifactType: 'art_direction_plan',
      status: 'accepted',
    },
    orderBy: {
      version: 'desc',
    },
    select: {
      jsonContent: true,
    },
  });

  if (!artifact?.jsonContent || typeof artifact.jsonContent !== 'object' || Array.isArray(artifact.jsonContent)) {
    return [];
  }

  const generatedImages = (artifact.jsonContent as Record<string, unknown>).generatedImages;
  if (!Array.isArray(generatedImages)) {
    return [];
  }

  return generatedImages.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const candidate = entry as Record<string, unknown>;
    const documentSlug = String(candidate.documentSlug ?? '').trim();
    const nodeIndex = Number(candidate.nodeIndex);
    const blockType = String(candidate.blockType ?? '').trim();
    const prompt = String(candidate.prompt ?? '').trim();
    const rawModel = String(candidate.model ?? '').trim();
    const model: ImageModel = rawModel === 'dall-e-3' ? 'dall-e-3' : 'gpt-image-1';
    const size = String(candidate.size ?? '').trim() || '1024x1024';
    const assetId = String(candidate.assetId ?? '').trim();
    const assetUrl = String(candidate.assetUrl ?? '').trim();

    if (!documentSlug || !Number.isFinite(nodeIndex) || !blockType || !assetId || !assetUrl) {
      return [];
    }

    if (!['titlePage', 'chapterHeader', 'fullBleedImage', 'mapBlock', 'backCover', 'npcProfile'].includes(blockType)) {
      return [];
    }

    return [{
      documentSlug,
      nodeIndex,
      blockType: blockType as RealizedArtPlacement['blockType'],
      prompt,
      model,
      size,
      assetId,
      assetUrl,
    }];
  });
}

/**
 * Build the document manifest from the outline and accepted artifacts.
 */
export function buildManifestDocuments(
  outline: ChapterOutline,
  acceptedKeys: Set<string>,
): AssemblyDocumentSpec[] {
  const docs: AssemblyDocumentSpec[] = [];
  let sortOrder = 0;

  // Front matter (title page, credits, ToC) — sortOrder 0
  if (acceptedKeys.has('front-matter')) {
    docs.push({
      documentSlug: 'front-matter',
      title: 'Front Matter',
      kind: 'front_matter',
      artifactKeys: ['front-matter'],
      sortOrder: sortOrder++,
    });
  }

  // Chapters in outline order
  for (const ch of outline.chapters) {
    const draftKey = `chapter-draft-${ch.slug}`;
    const planKey = `chapter-plan-${ch.slug}`;
    const keys = [draftKey, planKey].filter((k) => acceptedKeys.has(k));
    docs.push({
      documentSlug: ch.slug,
      title: ch.title,
      kind: 'chapter',
      artifactKeys: keys.length > 0 ? keys : [draftKey],
      sortOrder: sortOrder++,
      targetPageCount: ch.targetPages,
    });
  }

  // Appendices in outline order
  for (const app of outline.appendices) {
    const draftKey = `appendix-draft-${app.slug}`;
    if (!acceptedKeys.has(draftKey)) {
      continue;
    }
    docs.push({
      documentSlug: app.slug,
      title: app.title,
      kind: 'appendix',
      artifactKeys: [draftKey],
      sortOrder: sortOrder++,
      targetPageCount: app.targetPages,
    });
  }

  return docs;
}

/**
 * Assemble accepted artifacts into ProjectDocuments.
 */
export async function assembleDocuments(
  run: { id: string; projectId: string },
): Promise<AssemblyResult> {
  // 1. Get the chapter outline
  const resolvedOutline = await resolveOutlineArtifact(run.id);
  if (!resolvedOutline) {
    throw new Error('No chapter outline found for run');
  }
  const outline = resolvedOutline.outline as ChapterOutline;

  if (!resolvedOutline.accepted) {
    await publishGenerationEvent(run.id, {
      type: 'run_warning',
      runId: run.id,
      message: `Using chapter outline v${resolvedOutline.version} with status "${resolvedOutline.status}" because no accepted outline was available.`,
      severity: 'warning',
    });
  }

  // 2. Get all accepted artifacts
  const accepted = await getAcceptedArtifacts(run.id);
  const acceptedGeneratedImages = await getAcceptedGeneratedImages(run.id);
  const acceptedByKey = new Map(accepted.map((a) => [a.artifactKey, a]));
  const acceptedKeys = new Set(accepted.map((a) => a.artifactKey));

  // 3. Build manifest
  const manifestDocs = buildManifestDocuments(outline, acceptedKeys);

  const existingManifest = await prisma.assemblyManifest.findFirst({
    where: {
      runId: run.id,
      version: 1,
    },
    select: {
      id: true,
    },
    orderBy: {
      createdAt: 'asc',
    },
  });

  const manifest = existingManifest
    ? await prisma.assemblyManifest.update({
      where: { id: existingManifest.id },
      data: {
        projectId: run.projectId,
        documents: manifestDocs as any,
        status: 'draft',
      },
    })
    : await prisma.assemblyManifest.create({
      data: {
        runId: run.id,
        projectId: run.projectId,
        version: 1,
        documents: manifestDocs as any,
        status: 'draft',
      },
    });

  // 4. Upsert ProjectDocument records keyed by project + slug.
  const documentIds: string[] = [];
  const createdDocs: Array<{
    id: string;
    slug: string;
    title: string;
    kind: 'front_matter' | 'chapter' | 'appendix' | 'back_matter';
    layoutPlan: unknown;
    content: unknown;
  }> = [];

  for (const spec of manifestDocs) {
    const { artifact, accepted } = await resolveAssemblySourceArtifact(run.id, spec, acceptedByKey);
    if (artifact && !accepted) {
      await publishGenerationEvent(run.id, {
        type: 'run_warning',
        runId: run.id,
        message: `Assembly used ${artifact.artifactType} "${artifact.title}" with status "${artifact.status}" because no accepted draft was available for "${spec.title}".`,
        severity: 'warning',
      });
    }

    const content = await resolveArtifactContent(artifact ? {
      id: artifact.id,
      title: artifact.title,
      markdownContent: artifact.markdownContent,
      tiptapContent: artifact.tiptapContent,
      jsonContent: artifact.jsonContent,
    } : undefined);
    const resolvedLayout = resolveDocumentLayout({
      content,
      kind: spec.kind,
      title: spec.title,
    });
    const publicationFields = buildPublicationDocumentStorageFields({
      content: resolvedLayout.content,
      layoutPlan: resolvedLayout.layoutPlan,
      kind: spec.kind,
      title: spec.title,
    });

    const doc = await prisma.projectDocument.upsert({
      where: {
        projectId_slug: {
          projectId: run.projectId,
          slug: spec.documentSlug,
        },
      },
      update: {
        runId: run.id,
        kind: spec.kind,
        title: spec.title,
        sortOrder: spec.sortOrder,
        targetPageCount: spec.targetPageCount ?? null,
        outlineJson: (artifact?.jsonContent as any) ?? Prisma.JsonNull,
        layoutPlan: resolvedLayout.layoutPlan as any,
        content: resolvedLayout.content as any,
        canonicalDocJson: publicationFields.canonicalDocJson,
        editorProjectionJson: publicationFields.editorProjectionJson,
        typstSource: publicationFields.typstSource,
        layoutSnapshotJson: publicationFields.layoutSnapshotJson,
        layoutEngineVersion: publicationFields.layoutEngineVersion,
        layoutSnapshotUpdatedAt: publicationFields.layoutSnapshotUpdatedAt,
        canonicalVersion: publicationFields.canonicalVersion,
        editorProjectionVersion: publicationFields.editorProjectionVersion,
        typstVersion: publicationFields.typstVersion,
        status: 'draft',
        sourceArtifactId: artifact?.id ?? null,
      },
      create: {
        projectId: run.projectId,
        runId: run.id,
        kind: spec.kind,
        title: spec.title,
        slug: spec.documentSlug,
        sortOrder: spec.sortOrder,
        targetPageCount: spec.targetPageCount ?? null,
        outlineJson: (artifact?.jsonContent as any) ?? Prisma.JsonNull,
        layoutPlan: resolvedLayout.layoutPlan as any,
        content: resolvedLayout.content as any,
        canonicalDocJson: publicationFields.canonicalDocJson,
        editorProjectionJson: publicationFields.editorProjectionJson,
        typstSource: publicationFields.typstSource,
        layoutSnapshotJson: publicationFields.layoutSnapshotJson,
        layoutEngineVersion: publicationFields.layoutEngineVersion,
        layoutSnapshotUpdatedAt: publicationFields.layoutSnapshotUpdatedAt,
        canonicalVersion: publicationFields.canonicalVersion,
        editorProjectionVersion: publicationFields.editorProjectionVersion,
        typstVersion: publicationFields.typstVersion,
        status: 'draft',
        sourceArtifactId: artifact?.id ?? null,
      },
    });

    documentIds.push(doc.id);
    createdDocs.push({
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      kind: doc.kind,
      layoutPlan: doc.layoutPlan,
      content: doc.content,
    });
  }

  const manifestSlugs = manifestDocs.map((spec) => spec.documentSlug);
  await prisma.projectDocument.deleteMany({
    where: {
      projectId: run.projectId,
      slug: { notIn: manifestSlugs },
    },
  });

  if (acceptedGeneratedImages.length > 0) {
    const artUpdatedDocuments = applyRealizedArtToDocuments(
      createdDocs.map((document) => ({
        id: document.id,
        slug: document.slug,
        content: document.content as any,
      })),
      acceptedGeneratedImages,
    );

    await Promise.all(
      artUpdatedDocuments.map((document) => {
        const existing = createdDocs.find((candidate) => candidate.id === document.id);
        if (!existing) return Promise.resolve();

        const resolvedLayout = resolveDocumentLayout({
          content: document.content as any,
          layoutPlan: existing.layoutPlan ?? null,
          kind: existing.kind,
          title: existing.title,
        });
        const publicationFields = buildPublicationDocumentStorageFields({
          content: resolvedLayout.content,
          layoutPlan: resolvedLayout.layoutPlan,
          kind: existing.kind,
          title: existing.title,
        }, {
          canonicalVersion: (existing as { canonicalVersion?: number | null }).canonicalVersion,
          editorProjectionVersion: (existing as { editorProjectionVersion?: number | null }).editorProjectionVersion,
          typstVersion: (existing as { typstVersion?: number | null }).typstVersion,
        });

        return prisma.projectDocument.update({
          where: { id: document.id },
          data: {
            content: resolvedLayout.content as any,
            layoutPlan: resolvedLayout.layoutPlan as any,
            canonicalDocJson: publicationFields.canonicalDocJson,
            editorProjectionJson: publicationFields.editorProjectionJson,
            typstSource: publicationFields.typstSource,
            layoutSnapshotJson: publicationFields.layoutSnapshotJson,
            layoutEngineVersion: publicationFields.layoutEngineVersion,
            layoutSnapshotUpdatedAt: publicationFields.layoutSnapshotUpdatedAt,
            canonicalVersion: publicationFields.canonicalVersion,
            editorProjectionVersion: publicationFields.editorProjectionVersion,
            typstVersion: publicationFields.typstVersion,
          },
        });
      }),
    );
  }

  await rebuildProjectContentCache(run.projectId);

  // 5. Update manifest status
  await prisma.assemblyManifest.update({
    where: { id: manifest.id },
    data: { status: 'assembled' },
  });

  // 6. Publish event
  await publishGenerationEvent(run.id, {
    type: 'run_status',
    runId: run.id,
    status: 'assembling',
    stage: 'assembly',
    progressPercent: 90,
  });

  return { manifestId: manifest.id, documentIds };
}
