import type { GraphInterrupt } from '@dnd-booker/shared';

type GraphRunType = 'generation' | 'agent';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStatus(value: unknown): GraphInterrupt['status'] {
  return value === 'approved' || value === 'edited' || value === 'rejected'
    ? value
    : 'pending';
}

export function readGraphInterrupts(
  graphStateJson: unknown,
  runType: GraphRunType,
  runId: string,
): GraphInterrupt[] {
  if (!isRecord(graphStateJson) || !Array.isArray(graphStateJson.interrupts)) {
    return [];
  }

  const interrupts = graphStateJson.interrupts
    .map((raw): GraphInterrupt | null => {
      if (!isRecord(raw) || typeof raw.id !== 'string') {
        return null;
      }

      const kind = typeof raw.kind === 'string' && raw.kind.trim()
        ? raw.kind.trim()
        : 'manual_review';
      const title = typeof raw.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : kind.replace(/_/g, ' ');
      const summary = typeof raw.summary === 'string' && raw.summary.trim()
        ? raw.summary.trim()
        : null;
      const createdAt = typeof raw.createdAt === 'string'
        ? raw.createdAt
        : new Date(0).toISOString();

      return {
        id: raw.id,
        runType,
        runId,
        kind,
        title,
        summary,
        status: normalizeStatus(raw.status),
        payload: raw.payload ?? null,
        resolutionPayload: raw.resolutionPayload ?? null,
        resolvedByUserId: typeof raw.resolvedByUserId === 'string' ? raw.resolvedByUserId : null,
        createdAt,
        resolvedAt: typeof raw.resolvedAt === 'string' ? raw.resolvedAt : null,
      };
    })
    .filter((interrupt): interrupt is GraphInterrupt => interrupt !== null);

  return interrupts.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export function readPendingGraphInterrupts(
  graphStateJson: unknown,
  runType: GraphRunType,
  runId: string,
): GraphInterrupt[] {
  return readGraphInterrupts(graphStateJson, runType, runId)
    .filter((interrupt) => interrupt.status === 'pending');
}
