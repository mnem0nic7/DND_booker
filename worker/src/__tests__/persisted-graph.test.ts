import { describe, expect, it } from 'vitest';
import {
  coercePersistedGraphSnapshot,
  runPersistedGraph,
} from '../graph/persisted-graph.js';

describe('persisted-graph', () => {
  it('resumes from the persisted current node instead of replaying earlier nodes', async () => {
    const executed: string[] = [];
    const persisted: Array<{ node: string | null; completedNodes: string[] }> = [];

    const result = await runPersistedGraph({
      startNode: 'one',
      initialData: { count: 0 },
      loadSnapshot: () => ({
        currentNode: 'two',
        completedNodes: ['one'],
        stepCount: 1,
        data: { count: 1 },
      }),
      nodes: {
        one: async () => {
          executed.push('one');
          return { nextNode: 'two', data: { count: 1 } };
        },
        two: async () => {
          executed.push('two');
          return { nextNode: null, data: { count: 2 } };
        },
      },
      checkControl: async () => 'active',
      externalContext: {},
      persistSnapshot: async (snapshot) => {
        persisted.push({
          node: snapshot.currentNode,
          completedNodes: [...snapshot.completedNodes],
        });
      },
    });

    expect(executed).toEqual(['two']);
    expect(result.outcome).toBe('completed');
    expect(result.snapshot.data.count).toBe(2);
    expect(result.snapshot.completedNodes).toEqual(['one', 'two']);
    expect(persisted.at(-1)).toEqual({
      node: null,
      completedNodes: ['one', 'two'],
    });
  });

  it('returns a paused outcome without executing a node when pause behavior is exit', async () => {
    const executed: string[] = [];

    const result = await runPersistedGraph({
      startNode: 'one',
      nodes: {
        one: async () => {
          executed.push('one');
          return { nextNode: null };
        },
      },
      checkControl: async () => 'paused',
      externalContext: {},
      persistSnapshot: async () => {},
    });

    expect(executed).toEqual([]);
    expect(result.outcome).toBe('paused');
    expect(result.snapshot.interrupted).toMatchObject({
      kind: 'paused',
      node: 'one',
    });
  });

  it('merges persisted runtime data with initial defaults', () => {
    const snapshot = coercePersistedGraphSnapshot(
      {
        currentNode: 'two',
        data: { count: 2 },
      },
      'one',
      { count: 0, label: 'draft' },
    );

    expect(snapshot.currentNode).toBe('two');
    expect(snapshot.data).toEqual({
      count: 2,
      label: 'draft',
    });
  });
});
