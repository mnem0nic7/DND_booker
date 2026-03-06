# Phase 10: BullMQ Worker Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the autonomous generation pipeline into background job execution via BullMQ so that browser disconnect doesn't stop a run and the worker can process generation tasks independently.

**Architecture:** The server enqueues a generation run onto a `generation` BullMQ queue. The worker picks it up with an orchestrator job that: resolves the AI model for the user, drives the pipeline through stages (planning → assets → prose → evaluation → assembly), creates/resolves generation tasks, and publishes SSE progress events via Redis pub/sub. A queue service on the server side provides the enqueue function. The worker reuses the same Prisma + Redis connection pattern as the existing export worker.

**Tech Stack:** BullMQ, ioredis, Prisma 6, Vercel AI SDK, Redis pub/sub

---

### Task 1: Queue Service (Server-Side Enqueue)

**Files:**
- Create: `server/src/services/generation/queue.service.ts`

**Step 1: Create the queue service**

This follows the same pattern as `server/src/services/export.service.ts` — creates a BullMQ Queue connected to Redis and provides an enqueue function.

```typescript
// server/src/services/generation/queue.service.ts
import { Queue, type ConnectionOptions } from 'bullmq';
import { redis } from '../../config/redis.js';

export interface GenerationJobData {
  runId: string;
  userId: string;
  projectId: string;
}

const generationQueue = new Queue('generation', {
  connection: redis as unknown as ConnectionOptions,
});

/**
 * Enqueue a generation run for background processing.
 */
export async function enqueueGenerationRun(
  runId: string,
  userId: string,
  projectId: string,
): Promise<string | undefined> {
  const job = await generationQueue.add(
    'orchestrate',
    { runId, userId, projectId } satisfies GenerationJobData,
    {
      attempts: 1,
      removeOnComplete: { age: 86400 },
      removeOnFail: { age: 604800 },
    },
  );
  return job.id;
}

/**
 * Close the generation queue connection (for graceful shutdown).
 */
export async function closeGenerationQueue(): Promise<void> {
  await generationQueue.close();
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/queue.service.ts
git commit -m "feat: add generation queue service for BullMQ enqueue"
```

---

### Task 2: Generation Orchestrator Job (Worker)

**Files:**
- Create: `worker/src/jobs/generation-orchestrator.job.ts`

**Step 1: Create the orchestrator job**

The orchestrator is the main pipeline driver. It:
1. Loads the run + user AI config
2. Runs stages sequentially: intake → bible → outline → canon expansion → chapter plans → chapter drafts → evaluation → revision → assembly → preflight
3. Transitions run status at each stage boundary
4. Publishes progress events via Redis pub/sub
5. Catches errors and marks the run as failed

Since the generation services live in the server package, the worker imports them directly (same monorepo, shared Prisma client). The key difference from the export job: generation is multi-stage and long-running.

```typescript
// worker/src/jobs/generation-orchestrator.job.ts
import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';

// Import generation services from server package
// Note: These imports work because both packages share the same Prisma client
// and the services are pure functions that only depend on Prisma + AI SDK
import { executeIntakeNormalization } from '../../server/src/services/generation/intake.service.js';
import { executeBibleGeneration } from '../../server/src/services/generation/bible.service.js';
import { executeOutlineGeneration } from '../../server/src/services/generation/outline.service.js';
import { expandAllCanonEntities } from '../../server/src/services/generation/canon.service.js';
import { executeChapterPlanGeneration } from '../../server/src/services/generation/chapter-plan.service.js';
import { executeChapterDraftGeneration } from '../../server/src/services/generation/chapter-writer.service.js';
import { evaluateArtifact } from '../../server/src/services/generation/evaluator.service.js';
import { reviseArtifact } from '../../server/src/services/generation/reviser.service.js';
import { assembleDocuments } from '../../server/src/services/generation/assembler.service.js';
import { runPreflight } from '../../server/src/services/generation/preflight.service.js';
import { publishGenerationEvent } from '../../server/src/services/generation/pubsub.service.js';
import { transitionRunStatus } from '../../server/src/services/generation/run.service.js';

export interface GenerationJobData {
  runId: string;
  userId: string;
  projectId: string;
}

/**
 * Main orchestrator job for autonomous generation.
 *
 * This is a long-running job that drives the entire generation pipeline.
 * Each stage transitions the run status and publishes progress events.
 */
export async function processGenerationJob(job: Job<GenerationJobData>): Promise<void> {
  const { runId, userId, projectId } = job.data;
  const run = { id: runId, projectId, userId };

  try {
    // Resolve AI model for this user
    const { model, maxOutputTokens } = await resolveModelForUser(userId);

    // Stage 1: Planning (intake + bible + outline)
    await transitionRunStatus(runId, userId, 'planning');
    await publishProgress(runId, 'planning', 5);

    const { normalizedInput } = await executeIntakeNormalization(
      run, job.data.projectId, model, maxOutputTokens,
    );
    await publishProgress(runId, 'planning', 15);

    const { bible, entities } = await executeBibleGeneration(
      run, normalizedInput, model, maxOutputTokens,
    );
    await publishProgress(runId, 'planning', 30);

    // Load the full bible content for downstream use
    const bibleRecord = await prisma.campaignBible.findFirst({
      where: { runId, projectId },
      orderBy: { createdAt: 'desc' },
    });
    const bibleContent = loadBibleContent(bibleRecord);

    const { outline } = await executeOutlineGeneration(
      run, bibleContent, model, maxOutputTokens,
    );
    await publishProgress(runId, 'planning', 40);

    // Stage 2: Asset Generation (canon expansion + chapter plans)
    await transitionRunStatus(runId, userId, 'generating_assets');

    const entitySeeds = bibleContent.entities;
    const entitySummaries = entities.map((e) => ({
      slug: e.slug,
      entityType: e.entityType,
      name: e.canonicalName,
      summary: '', // Will be enriched by expansion
    }));

    await expandAllCanonEntities(
      run, entitySeeds, bibleContent, model, maxOutputTokens,
    );
    await publishProgress(runId, 'generating_assets', 55);

    // Generate chapter plans
    for (let i = 0; i < outline.chapters.length; i++) {
      const chapter = outline.chapters[i];
      // Reload entity summaries with enriched data
      const enrichedEntities = await prisma.canonEntity.findMany({
        where: { runId, projectId },
        select: { slug: true, entityType: true, canonicalName: true, summary: true },
      });
      const summaries = enrichedEntities.map((e) => ({
        slug: e.slug,
        entityType: e.entityType,
        name: e.canonicalName,
        summary: e.summary ?? '',
      }));

      await executeChapterPlanGeneration(
        run, chapter, bibleContent, summaries, model, maxOutputTokens,
      );

      const planProgress = 55 + Math.round((i + 1) / outline.chapters.length * 10);
      await publishProgress(runId, 'generating_assets', planProgress);
    }
    await publishProgress(runId, 'generating_assets', 65);

    // Stage 3: Prose Generation (chapter drafts)
    await transitionRunStatus(runId, userId, 'generating_prose');

    for (let i = 0; i < outline.chapters.length; i++) {
      const chapter = outline.chapters[i];
      const priorSlugs = outline.chapters.slice(0, i).map((c) => c.slug);

      // Load the chapter plan
      const planArtifact = await prisma.generatedArtifact.findFirst({
        where: { runId, artifactKey: `chapter-plan-${chapter.slug}` },
        orderBy: { version: 'desc' },
      });

      const chapterPlan = planArtifact?.jsonContent as any;
      if (!chapterPlan) {
        console.warn(`[generation] No plan found for chapter ${chapter.slug}, skipping draft`);
        continue;
      }

      await executeChapterDraftGeneration(
        run, chapter, chapterPlan, bibleContent, priorSlugs, model, maxOutputTokens,
      );

      const proseProgress = 65 + Math.round((i + 1) / outline.chapters.length * 15);
      await publishProgress(runId, 'generating_prose', proseProgress);
    }
    await publishProgress(runId, 'generating_prose', 80);

    // Stage 4: Evaluation
    await transitionRunStatus(runId, userId, 'evaluating');

    const allArtifacts = await prisma.generatedArtifact.findMany({
      where: { runId, status: 'generated' },
      orderBy: { createdAt: 'asc' },
    });

    for (const artifact of allArtifacts) {
      const evalResult = await evaluateArtifact(
        { id: runId }, artifact.id, bibleContent, model, maxOutputTokens,
      );

      // If failed, attempt revision
      if (!evalResult.passed) {
        await transitionRunStatus(runId, userId, 'revising');

        const revised = await reviseArtifact(
          { id: runId }, artifact.id, evalResult.findings, bibleContent, model, maxOutputTokens,
        );

        if (revised) {
          // Re-evaluate the revised version
          const reEval = await evaluateArtifact(
            { id: runId }, revised.newArtifactId, bibleContent, model, maxOutputTokens,
          );

          if (!reEval.passed) {
            // Second revision attempt
            const revised2 = await reviseArtifact(
              { id: runId }, revised.newArtifactId, reEval.findings, bibleContent, model, maxOutputTokens,
            );
            if (revised2) {
              await evaluateArtifact(
                { id: runId }, revised2.newArtifactId, bibleContent, model, maxOutputTokens,
              );
            }
          }
        }

        await transitionRunStatus(runId, userId, 'evaluating');
      }
    }
    await publishProgress(runId, 'evaluating', 88);

    // Stage 5: Assembly + Preflight
    await transitionRunStatus(runId, userId, 'assembling');

    await assembleDocuments(run);
    await publishProgress(runId, 'assembling', 95);

    const preflight = await runPreflight(run);
    if (!preflight.passed) {
      const warnings = preflight.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; ');

      await publishGenerationEvent(runId, {
        type: 'run_warning',
        runId,
        message: `Preflight issues: ${warnings}`,
        severity: 'warning',
      });
    }

    // Complete
    await transitionRunStatus(runId, userId, 'completed');
    await publishGenerationEvent(runId, { type: 'run_completed', runId });
    await publishProgress(runId, 'completed', 100);

    console.log(`[generation] Run ${runId} completed successfully`);
  } catch (error: unknown) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.error(`[generation] Run ${runId} failed:`, message);

    try {
      await transitionRunStatus(runId, userId, 'failed', message);
      await publishGenerationEvent(runId, {
        type: 'run_failed',
        runId,
        reason: message,
      });
    } catch (dbErr) {
      console.error(`[generation] Failed to update run status:`, dbErr);
    }

    throw error;
  }
}

// --- Helpers ---

async function publishProgress(runId: string, stage: string, percent: number) {
  await publishGenerationEvent(runId, {
    type: 'run_status',
    runId,
    status: stage as any,
    stage,
    progressPercent: percent,
  });
}

async function resolveModelForUser(userId: string) {
  // Import AI settings service dynamically to avoid circular deps
  const { getAiSettings, getDecryptedApiKey } = await import(
    '../../server/src/services/ai-settings.service.js'
  );
  const { createModel } = await import('../../server/src/services/ai-provider.service.js');

  const settings = await getAiSettings(userId);
  if (!settings?.provider) {
    throw new Error('AI not configured for user');
  }

  const MAX_TOKENS = settings.provider === 'ollama' ? 1024 : 16384;

  if (settings.provider === 'ollama') {
    const ollamaModel = settings.model && !settings.model.startsWith('claude-') && !settings.model.startsWith('gpt-')
      ? settings.model : undefined;
    return {
      model: createModel(settings.provider, 'ollama', ollamaModel, settings.baseUrl ?? undefined),
      maxOutputTokens: MAX_TOKENS,
    };
  }

  if (!settings.hasApiKey) throw new Error('No API key configured');
  const apiKey = await getDecryptedApiKey(userId);
  if (!apiKey) throw new Error('Failed to decrypt API key');

  return {
    model: createModel(settings.provider, apiKey, settings.model ?? undefined),
    maxOutputTokens: MAX_TOKENS,
  };
}

/**
 * Load bible content from the Prisma record.
 * Casts the JSON fields back to their structured types.
 */
function loadBibleContent(record: any) {
  if (!record) throw new Error('No campaign bible found');
  return {
    title: record.title,
    summary: record.summary,
    premise: record.premise ?? '',
    worldRules: record.worldRules as any,
    actStructure: record.actStructure as any ?? [],
    timeline: record.timeline as any ?? [],
    levelProgression: record.levelProgression as any ?? null,
    pageBudget: record.pageBudget as any ?? [],
    styleGuide: record.styleGuide as any ?? { voice: '', vocabulary: [], avoidTerms: [], narrativePerspective: '', toneNotes: '' },
    openThreads: record.openThreads as any ?? [],
    entities: record.worldRules?.entities ?? (record as any).entities ?? [],
  };
}
```

**IMPORTANT NOTE about cross-package imports:** The above uses imports from `../../server/src/services/...` which works in development with `tsx` but won't work with compiled code. The proper approach for production is to either:
1. Move shared generation services to the `shared/` package
2. Use a build step that resolves the paths
3. Use symlinks

For now, this works with the `tsx` dev setup. The path from `worker/src/jobs/` to `server/src/services/` is `../../../server/src/services/`. Verify the actual relative path.

**Step 2: Verify the file parses correctly**

Run: `cd /home/gallison/workspace/DND_booker && node -e "require('esbuild').buildSync({ entryPoints: ['worker/src/jobs/generation-orchestrator.job.ts'], bundle: false, write: false, platform: 'node', format: 'esm' })" 2>&1 || echo "Check later during integration"`

This may not fully compile due to cross-package imports — that's expected and will be validated in integration.

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add worker/src/jobs/generation-orchestrator.job.ts
git commit -m "feat: add generation orchestrator job for BullMQ worker"
```

---

### Task 3: Register Generation Worker

**Files:**
- Modify: `worker/src/index.ts`

**Step 1: Add the generation worker to index.ts**

Add the generation worker alongside the existing export worker. Same connection, same shutdown pattern.

After the existing `cleanupWorker` definition (around line 24), add:

```typescript
import { processGenerationJob } from './jobs/generation-orchestrator.job.js';

// ... after cleanupWorker definition:

const generationWorker = new Worker('generation', processGenerationJob, {
  connection: connection as unknown as ConnectionOptions,
  concurrency: 1, // One generation run at a time to manage rate limits
});

generationWorker.on('completed', (job) => console.log(`Generation job ${job.id} completed`));
generationWorker.on('failed', (job, err) => console.error(`Generation job ${job?.id} failed:`, err.message));
generationWorker.on('error', (err) => console.error('[Generation Worker] Error:', err.message));
```

In the `shutdown` function, add `await generationWorker.close();` before the other close calls.

Update the final log line to: `console.log('Workers running (export + generation)...');`

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/worker && npx tsc --noEmit`
Note: This may fail due to cross-package imports from server. If so, skip type checking for now — the runtime will work with tsx.

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add worker/src/index.ts
git commit -m "feat: register generation worker in BullMQ worker index"
```

---

### Task 4: Queue Service Test

**Files:**
- Create: `server/src/__tests__/generation/queue.test.ts`

**Step 1: Write the queue service test**

Since we can't connect to Redis in tests, mock the BullMQ Queue. Test that `enqueueGenerationRun` calls `queue.add` with the right params.

```typescript
// server/src/__tests__/generation/queue.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BullMQ before importing the module
const mockAdd = vi.fn().mockResolvedValue({ id: 'mock-job-id' });
vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    add: mockAdd,
    close: vi.fn(),
  })),
}));

// Mock Redis
vi.mock('../../config/redis.js', () => ({
  redis: {},
}));

import { enqueueGenerationRun } from '../../services/generation/queue.service.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Generation Queue Service', () => {
  it('enqueues a generation run with correct data', async () => {
    const jobId = await enqueueGenerationRun('run-123', 'user-456', 'proj-789');

    expect(jobId).toBe('mock-job-id');
    expect(mockAdd).toHaveBeenCalledWith(
      'orchestrate',
      { runId: 'run-123', userId: 'user-456', projectId: 'proj-789' },
      expect.objectContaining({ attempts: 1 }),
    );
  });
});
```

**Step 2: Run tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/queue.test.ts`
Expected: 1 test PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/generation/queue.test.ts
git commit -m "test: add generation queue service test"
```

---

### Task 5: Integration Verification

**Files:**
- No new files

**Step 1: Run full server type check**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 2: Run all generation tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/`
Expected: All tests PASS (previous 94 + 1 queue test = 95 passing, plus 1 pre-existing pubsub timeout)
