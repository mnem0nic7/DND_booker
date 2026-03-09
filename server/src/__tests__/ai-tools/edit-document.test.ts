import { describe, expect, it } from 'vitest';
import { editDocument } from '../../services/ai-tools/content/edit-document.js';

const ctx = { userId: 'user-1', projectId: 'proj-1', requestId: 'req-1' };

describe('editDocument tool', () => {
  it('accepts move operations with destinationIndex', async () => {
    const result = await editDocument.execute(
      {
        description: 'Move the stat block closer to the encounter heading',
        operations: [
          {
            op: 'moveAfter',
            nodeIndex: 18,
            targetType: 'statBlock',
            destinationIndex: 16,
            destinationType: 'heading',
          },
        ],
      },
      ctx,
    );

    expect(result.success).toBe(true);
    expect((result.data as any)._documentEdit).toBe(true);
    expect((result.data as any).operations[0].op).toBe('moveAfter');
  });

  it('rejects move operations without destinationIndex', async () => {
    const result = await editDocument.execute(
      {
        description: 'Invalid move',
        operations: [
          {
            op: 'moveBefore',
            nodeIndex: 10,
            targetType: 'npcProfile',
          },
        ],
      },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('VALIDATION_ERROR');
    expect(result.error?.message).toContain('destinationIndex');
  });
});
