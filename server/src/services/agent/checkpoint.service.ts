import type { AgentCheckpoint, AgentScorecard, DocumentContent, LayoutPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

interface ProjectSnapshot {
  title: string;
  description: string;
  type: string;
  status: string;
  coverImageUrl: string | null;
  settings: unknown;
  content: unknown;
}

interface DocumentSnapshot {
  id: string;
  projectId: string;
  runId: string | null;
  kind: string;
  title: string;
  slug: string;
  sortOrder: number;
  targetPageCount: number | null;
  outlineJson: unknown | null;
  layoutPlan: LayoutPlan | null;
  content: DocumentContent;
  status: string;
  sourceArtifactId: string | null;
}

interface AssetSnapshot {
  id: string;
  filename: string;
  mimeType: string;
  url: string;
  sizeBytes: number;
  createdAt: string;
}

function serializeCheckpoint(checkpoint: any): AgentCheckpoint {
  return {
    id: checkpoint.id,
    runId: checkpoint.runId,
    label: checkpoint.label,
    summary: checkpoint.summary ?? null,
    cycleIndex: checkpoint.cycleIndex,
    isBest: checkpoint.isBest,
    scorecard: (checkpoint.scorecardJson as AgentScorecard | null) ?? null,
    createdAt: checkpoint.createdAt.toISOString(),
  };
}

export async function createAgentCheckpoint(input: {
  runId: string;
  projectId: string;
  label: string;
  summary?: string | null;
  cycleIndex: number;
  scorecard?: AgentScorecard | null;
  isBest?: boolean;
}) {
  const [project, documents, assets] = await Promise.all([
    prisma.project.findUniqueOrThrow({
      where: { id: input.projectId },
      select: {
        title: true,
        description: true,
        type: true,
        status: true,
        coverImageUrl: true,
        settings: true,
        content: true,
      },
    }),
    prisma.projectDocument.findMany({
      where: { projectId: input.projectId },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        projectId: true,
        runId: true,
        kind: true,
        title: true,
        slug: true,
        sortOrder: true,
        targetPageCount: true,
        outlineJson: true,
        layoutPlan: true,
        content: true,
        status: true,
        sourceArtifactId: true,
      },
    }),
    prisma.asset.findMany({
      where: { projectId: input.projectId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        url: true,
        sizeBytes: true,
        createdAt: true,
      },
    }),
  ]);

  const projectSnapshot: ProjectSnapshot = {
    title: project.title,
    description: project.description,
    type: project.type,
    status: project.status,
    coverImageUrl: project.coverImageUrl,
    settings: project.settings,
    content: project.content,
  };

  const documentsSnapshot: DocumentSnapshot[] = documents.map((document) => ({
    id: document.id,
    projectId: document.projectId,
    runId: document.runId,
    kind: document.kind,
    title: document.title,
    slug: document.slug,
    sortOrder: document.sortOrder,
    targetPageCount: document.targetPageCount,
    outlineJson: document.outlineJson,
    layoutPlan: (document.layoutPlan as LayoutPlan | null) ?? null,
    content: document.content as unknown as DocumentContent,
    status: document.status,
    sourceArtifactId: document.sourceArtifactId,
  }));

  const assetsSnapshot: AssetSnapshot[] = assets.map((asset) => ({
    id: asset.id,
    filename: asset.filename,
    mimeType: asset.mimeType,
    url: asset.url,
    sizeBytes: asset.sizeBytes,
    createdAt: asset.createdAt.toISOString(),
  }));

  const checkpoint = await prisma.$transaction(async (tx) => {
    if (input.isBest) {
      await tx.agentCheckpoint.updateMany({
        where: { runId: input.runId, isBest: true },
        data: { isBest: false },
      });
    }

    return tx.agentCheckpoint.create({
      data: {
        runId: input.runId,
        projectId: input.projectId,
        label: input.label,
        summary: input.summary ?? null,
        cycleIndex: input.cycleIndex,
        isBest: input.isBest ?? false,
        scorecardJson: input.scorecard as any,
        projectSnapshotJson: projectSnapshot as any,
        documentsSnapshotJson: documentsSnapshot as any,
        assetsSnapshotJson: assetsSnapshot as any,
      },
    });
  });

  return serializeCheckpoint(checkpoint);
}

export async function listAgentCheckpoints(runId: string, userId: string): Promise<AgentCheckpoint[] | null> {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId },
    select: { id: true },
  });
  if (!run) return null;

  const checkpoints = await prisma.agentCheckpoint.findMany({
    where: { runId },
    orderBy: [{ cycleIndex: 'desc' }, { createdAt: 'desc' }],
  });

  return checkpoints.map(serializeCheckpoint);
}

export async function getAgentCheckpoint(runId: string, checkpointId: string, userId: string) {
  const checkpoint = await prisma.agentCheckpoint.findFirst({
    where: {
      id: checkpointId,
      runId,
      run: { userId },
    },
  });
  return checkpoint ? serializeCheckpoint(checkpoint) : null;
}

export async function markBestCheckpoint(runId: string, checkpointId: string) {
  const checkpoint = await prisma.$transaction(async (tx) => {
    await tx.agentCheckpoint.updateMany({
      where: { runId, isBest: true },
      data: { isBest: false },
    });

    return tx.agentCheckpoint.update({
      where: { id: checkpointId },
      data: { isBest: true },
    });
  });

  return serializeCheckpoint(checkpoint);
}

export async function restoreAgentCheckpoint(runId: string, checkpointId: string, userId: string) {
  const checkpoint = await prisma.agentCheckpoint.findFirst({
    where: {
      id: checkpointId,
      runId,
      run: { userId },
    },
  });
  if (!checkpoint) return null;

  const projectSnapshot = checkpoint.projectSnapshotJson as unknown as ProjectSnapshot;
  const documentsSnapshot = checkpoint.documentsSnapshotJson as unknown as DocumentSnapshot[];

  await prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: checkpoint.projectId },
      data: {
        title: projectSnapshot.title,
        description: projectSnapshot.description,
        type: projectSnapshot.type as any,
        status: projectSnapshot.status as any,
        coverImageUrl: projectSnapshot.coverImageUrl,
        settings: projectSnapshot.settings as any,
        content: projectSnapshot.content as any,
      },
    });

    const snapshotIds = documentsSnapshot.map((document) => document.id);
    await tx.projectDocument.deleteMany({
      where: {
        projectId: checkpoint.projectId,
        id: { notIn: snapshotIds },
      },
    });

    for (const document of documentsSnapshot) {
      await tx.projectDocument.upsert({
        where: { id: document.id },
        update: {
          runId: document.runId,
          kind: document.kind as any,
          title: document.title,
          slug: document.slug,
          sortOrder: document.sortOrder,
          targetPageCount: document.targetPageCount,
          outlineJson: document.outlineJson as any,
          layoutPlan: document.layoutPlan as any,
          content: document.content as any,
          status: document.status,
          sourceArtifactId: document.sourceArtifactId,
        },
        create: {
          id: document.id,
          projectId: checkpoint.projectId,
          runId: document.runId,
          kind: document.kind as any,
          title: document.title,
          slug: document.slug,
          sortOrder: document.sortOrder,
          targetPageCount: document.targetPageCount,
          outlineJson: document.outlineJson as any,
          layoutPlan: document.layoutPlan as any,
          content: document.content as any,
          status: document.status,
          sourceArtifactId: document.sourceArtifactId,
        },
      });
    }
  });

  return serializeCheckpoint(checkpoint);
}
