export type GraphControlState = 'active' | 'paused' | 'cancelled';

export interface PersistedGraphSnapshot<Data extends Record<string, unknown>> {
  version: 1;
  currentNode: string | null;
  lastStartedNode: string | null;
  lastCompletedNode: string | null;
  completedNodes: string[];
  nodeExecutions: Record<string, number>;
  stepCount: number;
  data: Data;
  interrupted: {
    kind: 'paused' | 'cancelled';
    node: string | null;
    at: string;
  } | null;
  updatedAt: string;
}

export interface PersistedGraphNodeResult<Data extends Record<string, unknown>> {
  nextNode: string | null;
  data?: Partial<Data>;
}

export interface PersistedGraphNodeContext<
  Data extends Record<string, unknown>,
  ExternalContext,
> {
  nodeId: string;
  snapshot: PersistedGraphSnapshot<Data>;
  data: Data;
  externalContext: ExternalContext;
  persistData: (patch: Partial<Data>) => Promise<void>;
}

export type PersistedGraphNodeHandler<
  Data extends Record<string, unknown>,
  ExternalContext,
> = (
  context: PersistedGraphNodeContext<Data, ExternalContext>,
) => Promise<PersistedGraphNodeResult<Data>>;

interface PersistedGraphPersistMeta {
  phase: 'bootstrap' | 'checkpoint' | 'interrupted' | 'completed';
  nodeId: string | null;
}

export interface PersistedGraphOptions<
  Data extends Record<string, unknown>,
  ExternalContext,
> {
  startNode: string;
  initialData?: Data;
  nodes: Record<string, PersistedGraphNodeHandler<Data, ExternalContext>>;
  loadSnapshot?: (() => unknown) | undefined;
  persistSnapshot: (
    snapshot: PersistedGraphSnapshot<Data>,
    meta: PersistedGraphPersistMeta,
  ) => Promise<void>;
  checkControl: () => Promise<GraphControlState>;
  externalContext: ExternalContext;
  pauseBehavior?: 'exit' | 'wait';
  waitForResumeMs?: number;
}

export interface PersistedGraphRunResult<Data extends Record<string, unknown>> {
  outcome: 'completed' | 'paused' | 'cancelled';
  snapshot: PersistedGraphSnapshot<Data>;
}

const DEFAULT_WAIT_FOR_RESUME_MS = 2_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function coerceStringRecord(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const entries = Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]));
  return Object.fromEntries(entries);
}

export function createPersistedGraphSnapshot<Data extends Record<string, unknown>>(
  startNode: string,
  initialData?: Data,
): PersistedGraphSnapshot<Data> {
  return {
    version: 1,
    currentNode: startNode,
    lastStartedNode: null,
    lastCompletedNode: null,
    completedNodes: [],
    nodeExecutions: {},
    stepCount: 0,
    data: (initialData ?? {}) as Data,
    interrupted: null,
    updatedAt: new Date().toISOString(),
  };
}

export function coercePersistedGraphSnapshot<Data extends Record<string, unknown>>(
  raw: unknown,
  startNode: string,
  initialData?: Data,
): PersistedGraphSnapshot<Data> {
  if (!isRecord(raw)) {
    return createPersistedGraphSnapshot(startNode, initialData);
  }

  const nextData = {
    ...(initialData ?? {}),
    ...(isRecord(raw.data) ? raw.data : {}),
  } as Data;

  return {
    version: 1,
    currentNode: typeof raw.currentNode === 'string' || raw.currentNode === null
      ? raw.currentNode
      : startNode,
    lastStartedNode: typeof raw.lastStartedNode === 'string' || raw.lastStartedNode === null
      ? raw.lastStartedNode
      : null,
    lastCompletedNode: typeof raw.lastCompletedNode === 'string' || raw.lastCompletedNode === null
      ? raw.lastCompletedNode
      : null,
    completedNodes: coerceStringArray(raw.completedNodes),
    nodeExecutions: coerceStringRecord(raw.nodeExecutions),
    stepCount: typeof raw.stepCount === 'number' && Number.isFinite(raw.stepCount)
      ? raw.stepCount
      : 0,
    data: nextData,
    interrupted: isRecord(raw.interrupted)
      && (raw.interrupted.kind === 'paused' || raw.interrupted.kind === 'cancelled')
      ? {
        kind: raw.interrupted.kind,
        node: typeof raw.interrupted.node === 'string' || raw.interrupted.node === null
          ? raw.interrupted.node
          : null,
        at: typeof raw.interrupted.at === 'string' ? raw.interrupted.at : new Date().toISOString(),
      }
      : null,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

export async function runPersistedGraph<
  Data extends Record<string, unknown>,
  ExternalContext,
>(
  options: PersistedGraphOptions<Data, ExternalContext>,
): Promise<PersistedGraphRunResult<Data>> {
  const pauseBehavior = options.pauseBehavior ?? 'exit';
  const waitForResumeMs = options.waitForResumeMs ?? DEFAULT_WAIT_FOR_RESUME_MS;
  let snapshot = coercePersistedGraphSnapshot(
    options.loadSnapshot?.(),
    options.startNode,
    options.initialData,
  );

  await options.persistSnapshot(snapshot, {
    phase: 'bootstrap',
    nodeId: snapshot.currentNode,
  });

  while (snapshot.currentNode) {
    const controlState = await options.checkControl();
    if (controlState === 'cancelled') {
      snapshot = {
        ...snapshot,
        interrupted: {
          kind: 'cancelled',
          node: snapshot.currentNode,
          at: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
      await options.persistSnapshot(snapshot, {
        phase: 'interrupted',
        nodeId: snapshot.currentNode,
      });
      return { outcome: 'cancelled', snapshot };
    }

    if (controlState === 'paused') {
      if (pauseBehavior === 'wait') {
        await sleep(waitForResumeMs);
        continue;
      }

      snapshot = {
        ...snapshot,
        interrupted: {
          kind: 'paused',
          node: snapshot.currentNode,
          at: new Date().toISOString(),
        },
        updatedAt: new Date().toISOString(),
      };
      await options.persistSnapshot(snapshot, {
        phase: 'interrupted',
        nodeId: snapshot.currentNode,
      });
      return { outcome: 'paused', snapshot };
    }

    const nodeId = snapshot.currentNode;
    const node = options.nodes[nodeId];
    if (!node) {
      throw new Error(`Unknown graph node "${nodeId}"`);
    }

    snapshot = {
      ...snapshot,
      lastStartedNode: nodeId,
      interrupted: null,
      updatedAt: new Date().toISOString(),
    };
    await options.persistSnapshot(snapshot, {
      phase: 'checkpoint',
      nodeId,
    });

    const persistData = async (patch: Partial<Data>) => {
      snapshot = {
        ...snapshot,
        data: {
          ...snapshot.data,
          ...patch,
        },
        updatedAt: new Date().toISOString(),
      };
      await options.persistSnapshot(snapshot, {
        phase: 'checkpoint',
        nodeId,
      });
    };

    const result = await node({
      nodeId,
      snapshot,
      data: snapshot.data,
      externalContext: options.externalContext,
      persistData,
    });

    const nextNodeExecutions = {
      ...snapshot.nodeExecutions,
      [nodeId]: (snapshot.nodeExecutions[nodeId] ?? 0) + 1,
    };

    snapshot = {
      ...snapshot,
      currentNode: result.nextNode,
      lastCompletedNode: nodeId,
      completedNodes: snapshot.completedNodes.includes(nodeId)
        ? snapshot.completedNodes
        : [...snapshot.completedNodes, nodeId],
      nodeExecutions: nextNodeExecutions,
      stepCount: snapshot.stepCount + 1,
      data: {
        ...snapshot.data,
        ...(result.data ?? {}),
      },
      interrupted: null,
      updatedAt: new Date().toISOString(),
    };

    await options.persistSnapshot(snapshot, {
      phase: result.nextNode === null ? 'completed' : 'checkpoint',
      nodeId,
    });
  }

  return { outcome: 'completed', snapshot };
}
