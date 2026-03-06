# Phase 11: Chat Integration (AI Tool) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow the AI assistant to trigger autonomous generation from chat via a new `startGenerationRun` tool. When a user says "create a full campaign about X", the AI calls this tool, which creates a run and enqueues it for background processing.

**Architecture:** A new `ToolDefinition` (`startGenerationRun`) is added to the tool registry. It validates the request, creates a `GenerationRun` record via `createRun()`, enqueues it via `enqueueGenerationRun()`, and returns the run ID so the AI can inform the user. The tool is scoped to `project-chat` context.

**Tech Stack:** Zod, Prisma 6, BullMQ (via queue.service.ts)

---

### Task 1: Create the startGenerationRun Tool

**Files:**
- Create: `server/src/services/ai-tools/content/start-generation-run.ts`

**Step 1: Create the tool definition**

```typescript
// server/src/services/ai-tools/content/start-generation-run.ts
import { z } from 'zod';
import type { ToolDefinition } from '../types.js';
import { createRun } from '../../generation/run.service.js';
import { enqueueGenerationRun } from '../../generation/queue.service.js';

export const startGenerationRun: ToolDefinition = {
  name: 'startGenerationRun',
  description: 'Start an autonomous campaign/adventure generation run. This creates a background job that generates a full campaign bible, chapter outline, entity dossiers, chapter drafts, and assembles them into project documents. Use this when the user wants to generate a complete adventure, campaign, or sourcebook.',
  parameters: z.object({
    prompt: z.string().describe('The user\'s description of what to generate (campaign concept, setting, themes, etc.)'),
    mode: z.enum(['one_shot', 'module', 'campaign', 'sourcebook']).default('one_shot').describe('Type of content to generate'),
    quality: z.enum(['quick', 'polished']).default('quick').describe('Generation quality — quick for fast drafts, polished for publication-ready'),
    pageTarget: z.number().int().min(5).max(500).optional().describe('Target page count for the output'),
  }),
  contexts: ['project-chat'],
  execute: async (params, ctx) => {
    const { prompt, mode, quality, pageTarget } = params as {
      prompt: string;
      mode: 'one_shot' | 'module' | 'campaign' | 'sourcebook';
      quality: 'quick' | 'polished';
      pageTarget?: number;
    };

    // Create the generation run
    const run = await createRun({
      projectId: ctx.projectId,
      userId: ctx.userId,
      prompt,
      mode,
      quality,
      pageTarget,
    });

    if (!run) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: 'Project not found or access denied' },
      };
    }

    // Enqueue for background processing
    const jobId = await enqueueGenerationRun(run.id, ctx.userId, ctx.projectId);

    return {
      success: true,
      data: {
        runId: run.id,
        jobId,
        status: run.status,
        message: `Generation run started. I'll generate a ${mode} based on your description. You can monitor progress in the generation panel.`,
      },
    };
  },
};
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/ai-tools/content/start-generation-run.ts
git commit -m "feat: add startGenerationRun AI tool for triggering autonomous generation"
```

---

### Task 2: Register the Tool

**Files:**
- Modify: `server/src/services/ai-tools/register-all.ts`

**Step 1: Add the import and registration**

Add after the existing content tool imports (line 21):
```typescript
import { startGenerationRun } from './content/start-generation-run.js';
```

Add after the existing content registrations (line 45):
```typescript
  registry.register(startGenerationRun);
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/ai-tools/register-all.ts
git commit -m "feat: register startGenerationRun tool in global registry"
```

---

### Task 3: Tool Test

**Files:**
- Create: `server/src/__tests__/ai-tools/start-generation-run.test.ts`

**Step 1: Write the test**

Mock both `createRun` and `enqueueGenerationRun`, test success and failure paths.

```typescript
// server/src/__tests__/ai-tools/start-generation-run.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../../services/ai-tools/types.js';

const mockCreateRun = vi.hoisted(() => vi.fn());
const mockEnqueue = vi.hoisted(() => vi.fn());

vi.mock('../../services/generation/run.service.js', () => ({
  createRun: mockCreateRun,
}));

vi.mock('../../services/generation/queue.service.js', () => ({
  enqueueGenerationRun: mockEnqueue,
}));

import { startGenerationRun } from '../../services/ai-tools/content/start-generation-run.js';

const ctx: ToolContext = { userId: 'user-1', projectId: 'proj-1', requestId: 'req-1' };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('startGenerationRun tool', () => {
  it('creates a run and enqueues it', async () => {
    mockCreateRun.mockResolvedValue({
      id: 'run-abc',
      projectId: 'proj-1',
      userId: 'user-1',
      status: 'queued',
    });
    mockEnqueue.mockResolvedValue('job-123');

    const result = await startGenerationRun.execute(
      { prompt: 'A dark forest adventure', mode: 'one_shot', quality: 'quick' },
      ctx,
    );

    expect(result.success).toBe(true);
    expect((result.data as any).runId).toBe('run-abc');
    expect((result.data as any).jobId).toBe('job-123');

    expect(mockCreateRun).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'proj-1',
      userId: 'user-1',
      prompt: 'A dark forest adventure',
      mode: 'one_shot',
      quality: 'quick',
    }));
    expect(mockEnqueue).toHaveBeenCalledWith('run-abc', 'user-1', 'proj-1');
  });

  it('returns NOT_FOUND when project does not exist', async () => {
    mockCreateRun.mockResolvedValue(null);

    const result = await startGenerationRun.execute(
      { prompt: 'test', mode: 'one_shot', quality: 'quick' },
      ctx,
    );

    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('NOT_FOUND');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('has correct context scope', () => {
    expect(startGenerationRun.contexts).toContain('project-chat');
  });
});
```

**Step 2: Run tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/ai-tools/start-generation-run.test.ts`
Expected: All 3 tests PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/ai-tools/start-generation-run.test.ts
git commit -m "test: add startGenerationRun tool tests"
```

---

### Task 4: Integration Verification

**Files:**
- No new files

**Step 1: Run full server type check**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 2: Run all AI tool tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/ai-tools/`
Expected: All tests PASS

**Step 3: Run all generation tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/`
Expected: All tests PASS (95 passing + 1 pre-existing pubsub timeout)
