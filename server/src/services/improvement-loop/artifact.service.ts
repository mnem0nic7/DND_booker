import type { ImprovementLoopArtifact, ImprovementLoopArtifactType } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

function serializeArtifact(artifact: any): ImprovementLoopArtifact {
  return {
    id: artifact.id,
    runId: artifact.runId,
    projectId: artifact.projectId,
    artifactType: artifact.artifactType,
    artifactKey: artifact.artifactKey,
    status: artifact.status,
    version: artifact.version,
    title: artifact.title,
    summary: artifact.summary ?? null,
    jsonContent: artifact.jsonContent ?? null,
    markdownContent: artifact.markdownContent ?? null,
    metadata: artifact.metadata ?? null,
    createdAt: artifact.createdAt.toISOString(),
    updatedAt: artifact.updatedAt.toISOString(),
  };
}

async function nextArtifactVersion(runId: string, artifactType: string, artifactKey: string) {
  const latest = await prisma.improvementLoopArtifact.findFirst({
    where: { runId, artifactType, artifactKey },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  return (latest?.version ?? 0) + 1;
}

export async function createImprovementLoopArtifact(input: {
  runId: string;
  projectId: string;
  artifactType: ImprovementLoopArtifactType;
  artifactKey: string;
  title: string;
  summary?: string | null;
  jsonContent?: unknown;
  markdownContent?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: 'generated' | 'accepted' | 'failed';
}): Promise<ImprovementLoopArtifact> {
  const version = await nextArtifactVersion(input.runId, input.artifactType, input.artifactKey);
  const artifact = await prisma.improvementLoopArtifact.create({
    data: {
      runId: input.runId,
      projectId: input.projectId,
      artifactType: input.artifactType,
      artifactKey: input.artifactKey,
      status: input.status ?? 'accepted',
      version,
      title: input.title,
      summary: input.summary ?? null,
      jsonContent: input.jsonContent as any,
      markdownContent: input.markdownContent ?? null,
      metadata: input.metadata as any,
    },
  });

  return serializeArtifact(artifact);
}

export async function listImprovementLoopArtifacts(runId: string, userId: string): Promise<ImprovementLoopArtifact[] | null> {
  const run = await prisma.improvementLoopRun.findFirst({
    where: { id: runId, userId },
    select: { id: true },
  });
  if (!run) return null;

  const artifacts = await prisma.improvementLoopArtifact.findMany({
    where: { runId },
    orderBy: { createdAt: 'asc' },
  });

  return artifacts.map(serializeArtifact);
}

export async function getImprovementLoopArtifact(
  runId: string,
  artifactId: string,
  userId: string,
): Promise<ImprovementLoopArtifact | null> {
  const run = await prisma.improvementLoopRun.findFirst({
    where: { id: runId, userId },
    select: { id: true },
  });
  if (!run) return null;

  const artifact = await prisma.improvementLoopArtifact.findFirst({
    where: { id: artifactId, runId },
  });

  return artifact ? serializeArtifact(artifact) : null;
}
