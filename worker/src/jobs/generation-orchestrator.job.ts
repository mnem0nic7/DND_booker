import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';

export interface GenerationJobData {
  runId: string;
  userId: string;
  projectId: string;
}

const DEFAULT_OPTIONAL_STAGE_TIMEOUT_MS = 4 * 60 * 1000;

function resolveOptionalStageTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.GENERATION_OPTIONAL_STAGE_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_OPTIONAL_STAGE_TIMEOUT_MS;
}

async function withOptionalStageTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  const timeoutMs = resolveOptionalStageTimeoutMs();

  return await new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    task
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        reject(error);
      });
  });
}

async function resetRunStateForRetry(runId: string, projectId: string): Promise<void> {
  await prisma.$transaction([
    prisma.projectDocument.deleteMany({
      where: { runId, projectId },
    }),
    prisma.assemblyManifest.deleteMany({
      where: { runId, projectId },
    }),
    prisma.generationTask.deleteMany({
      where: { runId },
    }),
    prisma.generatedArtifact.deleteMany({
      where: { runId, projectId },
    }),
    prisma.canonEntity.deleteMany({
      where: { runId, projectId },
    }),
    prisma.campaignBible.deleteMany({
      where: { runId, projectId },
    }),
  ]);
}

/**
 * Main orchestrator job for autonomous generation.
 *
 * Drives the pipeline: intake -> bible -> outline -> canon -> plans -> drafts -> eval -> revise -> assemble -> preflight -> publication polish.
 *
 * NOTE: Generation services are imported dynamically from the server package.
 * This works with tsx in development. For production, services should be
 * extracted to a shared package.
 */
export async function processGenerationJob(job: Job<GenerationJobData>): Promise<void> {
  const { runId, userId, projectId } = job.data;

  // Fetch the full run record so we have inputPrompt/inputParameters for intake
  const fullRun = await prisma.generationRun.findUniqueOrThrow({ where: { id: runId } });
  const run = {
    id: runId,
    projectId,
    userId,
    inputPrompt: fullRun.inputPrompt,
    inputParameters: (fullRun.inputParameters && typeof fullRun.inputParameters === 'object' && !Array.isArray(fullRun.inputParameters))
      ? fullRun.inputParameters as Record<string, unknown>
      : null,
  };
  const isPolished = fullRun.quality === 'polished';
  const isOneShot = fullRun.mode === 'one_shot';
  const shouldResetForRetry = fullRun.progressPercent > 0 || fullRun.startedAt !== null;

  if (shouldResetForRetry) {
    await resetRunStateForRetry(runId, projectId);
  }

  // Dynamic imports to avoid cross-package resolution issues at module load time
  const { transitionRunStatus, updateRunProgress } = await import('../../../server/src/services/generation/run.service.js');
  const { publishGenerationEvent } = await import('../../../server/src/services/generation/pubsub.service.js');
  const { executeBibleGeneration } = await import('../../../server/src/services/generation/bible.service.js');
  const { executeOutlineGeneration } = await import('../../../server/src/services/generation/outline.service.js');
  const { executeFrontMatterGeneration } = await import('../../../server/src/services/generation/front-matter.service.js');
  const { expandAllCanonEntities } = await import('../../../server/src/services/generation/canon.service.js');
  const { executeChapterPlanGeneration } = await import('../../../server/src/services/generation/chapter-plan.service.js');
  const { executeChapterDraftGeneration } = await import('../../../server/src/services/generation/chapter-writer.service.js');
  const { evaluateArtifact } = await import('../../../server/src/services/generation/evaluator.service.js');
  const { reviseArtifact } = await import('../../../server/src/services/generation/reviser.service.js');
  const { assembleDocuments } = await import('../../../server/src/services/generation/assembler.service.js');
  const { runPreflight } = await import('../../../server/src/services/generation/preflight.service.js');
  const { executePublicationPolish } = await import('../../../server/src/services/generation/publication-polish.service.js');
  const { executeArtDirectionPass } = await import('../../../server/src/services/generation/art-direction.service.js');
  const { executeLayoutDirectorPass } = await import('../../../server/src/services/generation/layout-director.service.js');
  const { executeIntake } = await import('../../../server/src/services/generation/intake.service.js');

  async function publishProgress(status: string, stage: string, percent: number) {
    await updateRunProgress(runId, userId, stage, percent);
    await publishGenerationEvent(runId, {
      type: 'run_status',
      runId,
      status: status as any,
      stage,
      progressPercent: percent,
    });
  }

  try {
    const { model, maxOutputTokens } = await resolveModelForUser(userId);

    // Stage 1: Planning
    await transitionRunStatus(runId, userId, 'planning');
    await publishProgress('planning', 'planning', 5);

    const { normalizedInput } = await executeIntake(run, model, maxOutputTokens);
    await publishProgress('planning', 'planning', 15);

    const { bible, entities } = await executeBibleGeneration(run, normalizedInput, model, maxOutputTokens);
    await publishProgress('planning', 'planning', 30);

    const bibleRecord = await prisma.campaignBible.findFirst({
      where: { runId, projectId },
      orderBy: { createdAt: 'desc' },
    });
    const bibleContent = loadBibleContent(bibleRecord);

    const { outline } = await executeOutlineGeneration(run, bibleContent, model, maxOutputTokens);
    await publishProgress('planning', 'planning', 40);

    await executeFrontMatterGeneration(run, bibleContent, outline);

    // Stage 2: Asset Generation
    await transitionRunStatus(runId, userId, 'generating_assets');

    await expandAllCanonEntities(run, bibleContent.entities, bibleContent, model, maxOutputTokens);
    await publishProgress('generating_assets', 'generating_assets', 55);

    const enrichedEntities = await prisma.canonEntity.findMany({
      where: { runId, projectId },
      select: { slug: true, entityType: true, canonicalName: true, summary: true },
    });
    const entitySummaries = enrichedEntities.map((e: any) => ({
      slug: e.slug, entityType: e.entityType, name: e.canonicalName, summary: e.summary ?? '',
    }));

    for (let i = 0; i < outline.chapters.length; i++) {
      await executeChapterPlanGeneration(run, outline.chapters[i], bibleContent, entitySummaries, model, maxOutputTokens);
      await publishProgress('generating_assets', 'generating_assets', 55 + Math.round((i + 1) / outline.chapters.length * 10));
    }

    // Stage 3: Prose Generation
    await transitionRunStatus(runId, userId, 'generating_prose');

    for (let i = 0; i < outline.chapters.length; i++) {
      const chapter = outline.chapters[i];
      const priorSlugs = outline.chapters.slice(0, i).map((c: any) => c.slug);
      const planArtifact = await prisma.generatedArtifact.findFirst({
        where: { runId, artifactKey: `chapter-plan-${chapter.slug}` },
        orderBy: { version: 'desc' },
      });
      if (!planArtifact?.jsonContent) {
        console.warn(`[generation] No plan for chapter ${chapter.slug}, skipping`);
        continue;
      }
      await executeChapterDraftGeneration(run, chapter, planArtifact.jsonContent as any, bibleContent, priorSlugs, model, maxOutputTokens);
      await publishProgress('generating_prose', 'generating_prose', 65 + Math.round((i + 1) / outline.chapters.length * 15));
    }

    // Stage 4: Evaluation + Revision (polished quality only)
    if (isPolished) {
      await transitionRunStatus(runId, userId, 'evaluating');

      const generatedArtifacts = await prisma.generatedArtifact.findMany({
        where: { runId, status: 'generated' },
        orderBy: { createdAt: 'asc' },
      });

      for (const artifact of generatedArtifacts) {
        const evalResult = await evaluateArtifact({ id: runId }, artifact.id, bibleContent, model, maxOutputTokens);

        if (!evalResult.passed) {
          await transitionRunStatus(runId, userId, 'revising');
          const revised = await reviseArtifact({ id: runId }, artifact.id, evalResult.findings, bibleContent, model, maxOutputTokens);
          if (revised) {
            const reEval = await evaluateArtifact({ id: runId }, revised.newArtifactId, bibleContent, model, maxOutputTokens);
            if (!reEval.passed) {
              const revised2 = await reviseArtifact({ id: runId }, revised.newArtifactId, reEval.findings, bibleContent, model, maxOutputTokens);
              if (revised2) {
                await evaluateArtifact({ id: runId }, revised2.newArtifactId, bibleContent, model, maxOutputTokens);
              }
            }
          }
          await transitionRunStatus(runId, userId, 'evaluating');
        }
      }
    } else {
      // Quick mode: accept all generated artifacts as-is
      await prisma.generatedArtifact.updateMany({
        where: { runId, status: 'generated' },
        data: { status: 'accepted' },
      });
    }

    // Stage 5: Assembly + Preflight
    await transitionRunStatus(runId, userId, 'assembling');
    await assembleDocuments(run);
    await publishProgress('assembling', 'assembly', 90);

    let preflight = await runPreflight(run);

    await publishProgress('assembling', 'publication_polish', 94);

    const polish = await executePublicationPolish(run, preflight);

    if (polish.operationsApplied > 0) {
      await publishGenerationEvent(runId, {
        type: 'run_warning',
        runId,
        message: `Publication polish applied ${polish.operationsApplied} structural fix(es) across ${polish.documentsUpdated} document(s).`,
        severity: 'info',
      });
    } else if (polish.polishableIssuesSeen > 0) {
      await publishGenerationEvent(runId, {
        type: 'run_warning',
        runId,
        message: `Publication polish found ${polish.polishableIssuesSeen} polishable issue(s) but no safe automatic fixes were available.`,
        severity: 'warning',
      });
    }

    if (polish.documentsUpdated > 0) {
      await publishProgress('assembling', 'preflight_recheck', 97);
      preflight = await runPreflight(run);
    }

    const warningMsgs = preflight.issues
      .filter((i: any) => i.severity === 'warning')
      .map((i: any) => i.message)
      .join('; ');

    if (warningMsgs) {
      await publishGenerationEvent(runId, {
        type: 'run_warning',
        runId,
        message: `Preflight warnings: ${warningMsgs}`,
        severity: 'warning',
      });
    }

    if (!preflight.passed) {
      const errorMsgs = preflight.issues.filter((i: any) => i.severity === 'error').map((i: any) => i.message).join('; ');
      throw new Error(`Preflight failed: ${errorMsgs || 'compiled document validation reported blocking issues'}`);
    }

    if (isOneShot) {
      await publishProgress('assembling', 'art_direction', 99);
      try {
        const artDirection = await withOptionalStageTimeout(
          'Art direction pass',
          executeArtDirectionPass(run, model, maxOutputTokens),
        );
        if (artDirection.generatedImageCount > 0) {
          await publishGenerationEvent(runId, {
            type: 'run_warning',
            runId,
            message: `Art direction automatically generated ${artDirection.generatedImageCount} project image asset(s) across ${artDirection.placementCount} selected placement(s).`,
            severity: 'info',
          });
        } else if (artDirection.placementCount > 0 && artDirection.skippedImageGenerationReason) {
          await publishGenerationEvent(runId, {
            type: 'run_warning',
            runId,
            message: `Art direction selected ${artDirection.placementCount} image placement(s), but automatic image generation was skipped: ${artDirection.skippedImageGenerationReason}`,
            severity: 'warning',
          });
        } else if (artDirection.placementCount > 0 && artDirection.failedImageCount > 0) {
          await publishGenerationEvent(runId, {
            type: 'run_warning',
            runId,
            message: `Art direction planned ${artDirection.placementCount} image placement(s), but ${artDirection.failedImageCount} image generation attempt(s) failed.`,
            severity: 'warning',
          });
        }
      } catch (artErr) {
        const message = artErr instanceof Error ? artErr.message : String(artErr);
        await publishGenerationEvent(runId, {
          type: 'run_warning',
          runId,
          message: `Art direction pass failed: ${message}`,
          severity: 'warning',
        });
      }
    }

    await publishProgress('assembling', 'layout_director', 99);
    try {
      const layoutDirector = await withOptionalStageTimeout(
        'Layout director pass',
        executeLayoutDirectorPass(run),
      );
      if (layoutDirector.documentsUpdated > 0) {
        await publishGenerationEvent(runId, {
          type: 'run_warning',
          runId,
          message: `Layout director refreshed canonical presentation plans for ${layoutDirector.documentsUpdated} document(s).`,
          severity: 'info',
        });
      }
    } catch (layoutErr) {
      const message = layoutErr instanceof Error ? layoutErr.message : String(layoutErr);
      await publishGenerationEvent(runId, {
        type: 'run_warning',
        runId,
        message: `Layout director pass failed: ${message}`,
        severity: 'warning',
      });
    }

    // Complete
    await transitionRunStatus(runId, userId, 'completed');
    await publishGenerationEvent(runId, { type: 'run_completed', runId });
    console.log(`[generation] Run ${runId} completed`);

  } catch (error: unknown) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.error(`[generation] Run ${runId} failed:`, message);
    try {
      const { transitionRunStatus: transition } = await import('../../../server/src/services/generation/run.service.js');
      const { publishGenerationEvent: publish } = await import('../../../server/src/services/generation/pubsub.service.js');
      await transition(runId, userId, 'failed', message);
      await publish(runId, { type: 'run_failed', runId, reason: message });
    } catch (dbErr) {
      console.error(`[generation] Failed to update run status:`, dbErr);
    }
    throw error;
  }
}

async function resolveModelForUser(userId: string) {
  const { getAiSettings, getDecryptedApiKey } = await import('../../../server/src/services/ai-settings.service.js');
  const { createModel } = await import('../../../server/src/services/ai-provider.service.js');

  const settings = await getAiSettings(userId);
  if (!settings?.provider) throw new Error('AI not configured for user');

  const MAX_TOKENS = settings.provider === 'ollama' ? 1024 : 16384;

  if (settings.provider === 'ollama') {
    const ollamaModel = settings.model && !settings.model.startsWith('claude-') && !settings.model.startsWith('gpt-')
      ? settings.model : undefined;
    return { model: createModel(settings.provider, 'ollama', ollamaModel, settings.baseUrl ?? undefined), maxOutputTokens: MAX_TOKENS };
  }

  if (!settings.hasApiKey) throw new Error('No API key configured');
  const apiKey = await getDecryptedApiKey(userId);
  if (!apiKey) throw new Error('Failed to decrypt API key');

  return { model: createModel(settings.provider, apiKey, settings.model ?? undefined), maxOutputTokens: MAX_TOKENS };
}

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
    entities: (record as any).entities ?? [],
  };
}
