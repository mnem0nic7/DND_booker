import type { ChapterOutline, AssemblyDocumentSpec } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { resolveOutlineArtifact } from './outline-artifact.service.js';
import { resolveDocumentLayout } from '../layout-plan.service.js';

export interface AssemblyResult {
  manifestId: string;
  documentIds: string[];
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
  const acceptedByKey = new Map(accepted.map((a) => [a.artifactKey, a]));
  const acceptedKeys = new Set(accepted.map((a) => a.artifactKey));

  // 3. Build manifest
  const manifestDocs = buildManifestDocuments(outline, acceptedKeys);

  const manifest = await prisma.assemblyManifest.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      version: 1,
      documents: manifestDocs as any,
      status: 'draft',
    },
  });

  // 4. Replace any pre-existing project documents for this project.
  await prisma.projectDocument.deleteMany({
    where: { projectId: run.projectId },
  });

  // 5. Create ProjectDocument records
  const documentIds: string[] = [];

  for (const spec of manifestDocs) {
    // Find the primary content artifact (draft > plan)
    const draftKey = spec.artifactKeys[0];
    const artifact = acceptedByKey.get(draftKey);

    const content = artifact?.tiptapContent ?? artifact?.jsonContent ?? {};
    const resolvedLayout = resolveDocumentLayout({
      content,
      kind: spec.kind,
      title: spec.title,
    });

    const doc = await prisma.projectDocument.create({
      data: {
        projectId: run.projectId,
        runId: run.id,
        kind: spec.kind,
        title: spec.title,
        slug: spec.documentSlug,
        sortOrder: spec.sortOrder,
        targetPageCount: spec.targetPageCount ?? null,
        outlineJson: artifact?.jsonContent as any ?? null,
        layoutPlan: resolvedLayout.layoutPlan as any,
        content: resolvedLayout.content as any,
        status: 'draft',
        sourceArtifactId: artifact?.id ?? null,
      },
    });

    documentIds.push(doc.id);
  }

  // 6. Update manifest status
  await prisma.assemblyManifest.update({
    where: { id: manifest.id },
    data: { status: 'assembled' },
  });

  // 7. Publish event
  await publishGenerationEvent(run.id, {
    type: 'run_status',
    runId: run.id,
    status: 'assembling',
    stage: 'assembly',
    progressPercent: 90,
  });

  return { manifestId: manifest.id, documentIds };
}
