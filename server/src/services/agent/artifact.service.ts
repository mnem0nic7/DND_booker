import { prisma } from '../../config/database.js';

async function resolveArtifactRunId(agentRunId: string): Promise<string | null> {
  const run = await prisma.agentRun.findUnique({
    where: { id: agentRunId },
    select: {
      linkedGenerationRunId: true,
      projectId: true,
    },
  });
  if (!run) return null;
  if (run.linkedGenerationRunId) return run.linkedGenerationRunId;

  const fallbackRun = await prisma.generationRun.findFirst({
    where: { projectId: run.projectId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return fallbackRun?.id ?? null;
}

async function nextArtifactVersion(runId: string, artifactType: string, artifactKey: string) {
  const latest = await prisma.generatedArtifact.findFirst({
    where: { runId, artifactType, artifactKey },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  return (latest?.version ?? 0) + 1;
}

export async function createAgentGeneratedArtifactIfPossible(input: {
  agentRunId: string;
  projectId: string;
  artifactType: 'design_profile' | 'agent_run_report' | 'checkpoint_comparison';
  artifactKey: string;
  title: string;
  summary?: string | null;
  jsonContent?: unknown;
  markdownContent?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  const runId = await resolveArtifactRunId(input.agentRunId);
  if (!runId) return null;

  const version = await nextArtifactVersion(runId, input.artifactType, input.artifactKey);
  return prisma.generatedArtifact.create({
    data: {
      runId,
      projectId: input.projectId,
      artifactType: input.artifactType,
      artifactKey: input.artifactKey,
      status: 'accepted',
      version,
      title: input.title,
      summary: input.summary ?? null,
      jsonContent: input.jsonContent as any,
      markdownContent: input.markdownContent ?? null,
      metadata: {
        ...(input.metadata ?? {}),
        source: 'agent_run',
        agentRunId: input.agentRunId,
      } as any,
    },
  });
}
