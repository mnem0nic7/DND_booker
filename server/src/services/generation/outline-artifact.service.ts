import type { ChapterOutline } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

export interface ResolvedOutlineArtifact {
  artifactId: string;
  version: number;
  status: string;
  outline: ChapterOutline;
  accepted: boolean;
}

/**
 * Prefer the latest accepted outline, but fall back to the latest available
 * outline artifact so later pipeline stages can assemble the same structure
 * that prose generation already used.
 */
export async function resolveOutlineArtifact(
  runId: string,
): Promise<ResolvedOutlineArtifact | null> {
  const accepted = await prisma.generatedArtifact.findFirst({
    where: { runId, artifactType: 'chapter_outline', status: 'accepted' },
    orderBy: { version: 'desc' },
  });

  if (accepted?.jsonContent) {
    return {
      artifactId: accepted.id,
      version: accepted.version,
      status: accepted.status,
      outline: accepted.jsonContent as unknown as ChapterOutline,
      accepted: true,
    };
  }

  const fallback = await prisma.generatedArtifact.findFirst({
    where: {
      runId,
      artifactType: 'chapter_outline',
      status: {
        in: ['generated', 'failed_evaluation', 'needs_review', 'revising', 'passed', 'evaluating'],
      },
    },
    orderBy: { version: 'desc' },
  });

  if (!fallback?.jsonContent) {
    return null;
  }

  return {
    artifactId: fallback.id,
    version: fallback.version,
    status: fallback.status,
    outline: fallback.jsonContent as unknown as ChapterOutline,
    accepted: false,
  };
}
