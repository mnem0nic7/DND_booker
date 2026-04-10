import type { Job } from 'bullmq';
import type {
  BibleContent,
  ChapterOutline,
  NormalizedInput,
  RunStatus,
} from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import {
  runPersistedGraph,
  type PersistedGraphSnapshot,
} from '../graph/persisted-graph.js';

export interface GenerationJobData {
  runId: string;
  userId: string;
  projectId: string;
}

interface GenerationGraphData extends Record<string, unknown> {
  latestPreflight: StoredPreflightResult | null;
  needsPreflightRecheck: boolean;
  quickModeAccepted: boolean;
  manualReviewRecheckPending: boolean;
}

interface StoredPreflightIssue {
  severity: 'error' | 'warning' | 'info';
  message: string;
  code: string;
  documentSlug?: string;
}

interface StoredPreflightResult {
  passed: boolean;
  issues: StoredPreflightIssue[];
}

const DEFAULT_OPTIONAL_STAGE_TIMEOUT_MS = 4 * 60 * 1000;
const REVISION_ELIGIBLE_CATEGORIES = new Set(['written']);
const SUPPORTED_CANON_ENTITY_TYPES: Record<string, string> = {
  npc: 'npc_dossier',
  location: 'location_brief',
  faction: 'faction_profile',
  quest: 'encounter_bundle',
  item: 'item_bundle',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readResolutionNote(value: unknown) {
  if (!isRecord(value) || typeof value.note !== 'string') {
    return null;
  }

  const note = value.note.trim();
  return note ? note : null;
}

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

function hasRetryRemaining(job: Job<GenerationJobData>) {
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
  return job.attemptsMade + 1 < attempts;
}

async function loadGenerationDependencies() {
  const runService = await import('../../../server/src/services/generation/run.service.js');
  const pubsubService = await import('../../../server/src/services/generation/pubsub.service.js');
  const bibleService = await import('../../../server/src/services/generation/bible.service.js');
  const outlineService = await import('../../../server/src/services/generation/outline.service.js');
  const frontMatterService = await import('../../../server/src/services/generation/front-matter.service.js');
  const canonService = await import('../../../server/src/services/generation/canon.service.js');
  const chapterPlanService = await import('../../../server/src/services/generation/chapter-plan.service.js');
  const chapterWriterService = await import('../../../server/src/services/generation/chapter-writer.service.js');
  const evaluatorService = await import('../../../server/src/services/generation/evaluator.service.js');
  const reviserService = await import('../../../server/src/services/generation/reviser.service.js');
  const assemblerService = await import('../../../server/src/services/generation/assembler.service.js');
  const preflightService = await import('../../../server/src/services/generation/preflight.service.js');
  const publicationPolishService = await import('../../../server/src/services/generation/publication-polish.service.js');
  const artDirectionService = await import('../../../server/src/services/generation/art-direction.service.js');
  const layoutDirectorService = await import('../../../server/src/services/generation/layout-director.service.js');
  const intakeService = await import('../../../server/src/services/generation/intake.service.js');
  const interruptService = await import('../../../server/src/services/graph/interrupt.service.js');

  return {
    ...runService,
    ...pubsubService,
    ...bibleService,
    ...outlineService,
    ...frontMatterService,
    ...canonService,
    ...chapterPlanService,
    ...chapterWriterService,
    ...evaluatorService,
    ...reviserService,
    ...assemblerService,
    ...preflightService,
    ...publicationPolishService,
    ...artDirectionService,
    ...layoutDirectorService,
    ...intakeService,
    ...interruptService,
  };
}

function readRuntimeState(graphStateJson: unknown) {
  if (!isRecord(graphStateJson)) return null;
  return graphStateJson.runtime ?? null;
}

function buildRuntimePatch(
  snapshot: PersistedGraphSnapshot<GenerationGraphData>,
  graphCheckpointKey: string | null,
) {
  const resumeToken = `${graphCheckpointKey ?? 'generation'}:${snapshot.currentNode ?? 'completed'}:${snapshot.stepCount}`;
  return {
    runtime: snapshot,
    currentNode: snapshot.currentNode,
    lastStartedNode: snapshot.lastStartedNode,
    lastCompletedNode: snapshot.lastCompletedNode,
    completedNodes: snapshot.completedNodes,
    nodeExecutions: snapshot.nodeExecutions,
    stepCount: snapshot.stepCount,
    interrupted: snapshot.interrupted,
    graphRuntimeVersion: snapshot.version,
    resumeToken,
  };
}

async function loadArtifactByKey(runId: string, artifactKey: string) {
  return prisma.generatedArtifact.findFirst({
    where: { runId, artifactKey },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
  });
}

async function loadNormalizedInput(runId: string): Promise<NormalizedInput | null> {
  const artifact = await loadArtifactByKey(runId, 'project-profile');
  return artifact?.jsonContent ? artifact.jsonContent as unknown as NormalizedInput : null;
}

async function loadBibleContent(runId: string): Promise<BibleContent | null> {
  const artifact = await loadArtifactByKey(runId, 'campaign-bible');
  return artifact?.jsonContent ? artifact.jsonContent as unknown as BibleContent : null;
}

async function loadOutline(runId: string): Promise<ChapterOutline | null> {
  const artifact = await loadArtifactByKey(runId, 'chapter-outline');
  return artifact?.jsonContent ? artifact.jsonContent as unknown as ChapterOutline : null;
}

async function loadArtifactKeySet(runId: string, artifactKeys: string[]): Promise<Set<string>> {
  if (artifactKeys.length === 0) return new Set();

  const artifacts = await prisma.generatedArtifact.findMany({
    where: {
      runId,
      artifactKey: { in: artifactKeys },
    },
    select: { artifactKey: true },
  });

  return new Set(artifacts.map((artifact) => artifact.artifactKey));
}

async function loadGenerationControlState(runId: string) {
  const run = await prisma.generationRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });

  if (!run) {
    throw new Error('Generation run no longer exists.');
  }

  if (run.status === 'cancelled') return 'cancelled' as const;
  if (run.status === 'paused') return 'paused' as const;
  return 'active' as const;
}

async function resolveModelForUser(userId: string, projectId: string) {
  const { resolveAgentModelForUser } = await import('../../../server/src/services/agent/model-resolution.service.js');

  const resolvedModels = new Map<string, Awaited<ReturnType<typeof resolveAgentModelForUser>>>();

  return async (agentKey: string) => {
    const cached = resolvedModels.get(agentKey);
    if (cached) {
      return cached;
    }

    const resolved = await resolveAgentModelForUser(userId, {
      agentKey,
      projectId,
    });
    console.info(`[generation.model] ${agentKey} -> ${resolved.selection.provider}/${resolved.selection.model ?? 'default'}`);
    resolvedModels.set(agentKey, resolved);
    return resolved;
  };
}

async function publishPreflightWarnings(
  runId: string,
  publishGenerationEvent: (runId: string, event: any) => Promise<void>,
  preflight: StoredPreflightResult,
) {
  const warningMsgs = preflight.issues
    .filter((issue) => issue.severity === 'warning')
    .map((issue) => issue.message)
    .join('; ');

  if (warningMsgs) {
    await publishGenerationEvent(runId, {
      type: 'run_warning',
      runId,
      message: `Preflight warnings: ${warningMsgs}`,
      severity: 'warning',
    });
  }
}

export async function processGenerationJob(job: Job<GenerationJobData>): Promise<void> {
  const { runId, userId, projectId } = job.data;
  const fullRun = await prisma.generationRun.findUniqueOrThrow({
    where: { id: runId },
  });
  const runEnvelope = {
    id: runId,
    projectId,
    userId,
    inputPrompt: fullRun.inputPrompt,
    pageTargetHint: fullRun.estimatedPages ?? null,
    inputParameters: (fullRun.inputParameters && typeof fullRun.inputParameters === 'object' && !Array.isArray(fullRun.inputParameters))
      ? fullRun.inputParameters as Record<string, unknown>
      : null,
  };
  const isPolished = fullRun.quality === 'polished';
  const dependencies = await loadGenerationDependencies();
  const resolveModelForAgent = await resolveModelForUser(userId, projectId);

  async function publishProgress(status: RunStatus, progressPercent: number) {
    const updated = await dependencies.updateRunProgress(runId, userId, status, progressPercent);
    await dependencies.publishGenerationEvent(runId, {
      type: 'run_status',
      runId,
      status,
      stage: status,
      progressPercent: updated?.progressPercent ?? progressPercent,
    });
  }

  async function setRunStatus(status: RunStatus, progressPercent: number) {
    const current = await prisma.generationRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (!current) {
      throw new Error('Generation run no longer exists.');
    }

    if (current.status !== status) {
      await dependencies.transitionRunStatus(runId, userId, status);
    }

    await publishProgress(status, progressPercent);
  }

  async function ensureNormalizedInput() {
    const existing = await loadNormalizedInput(runId);
    if (existing) {
      await prisma.generationRun.update({
        where: { id: runId },
        data: {
          mode: existing.inferredMode,
          estimatedPages: existing.pageTarget,
        },
      });
      return existing;
    }

    const { model, maxOutputTokens } = await resolveModelForAgent('agent.intake');
    const { normalizedInput } = await dependencies.executeIntake(runEnvelope, model, maxOutputTokens);
    return normalizedInput as NormalizedInput;
  }

  async function ensureBibleContent() {
    const existing = await loadBibleContent(runId);
    if (existing) return existing;

    const normalizedInput = await ensureNormalizedInput();
    const { model, maxOutputTokens } = await resolveModelForAgent('agent.bible');
    const result = await dependencies.executeBibleGeneration(runEnvelope, normalizedInput, model, maxOutputTokens);
    const created = await loadBibleContent(runId);
    if (created) return created;
    throw new Error(`Failed to load campaign bible after creation for artifact ${result.artifactId}`);
  }

  async function ensureOutline() {
    const existing = await loadOutline(runId);
    if (existing) return existing;

    const bibleContent = await ensureBibleContent();
    const { model, maxOutputTokens } = await resolveModelForAgent('agent.outline');
    const result = await dependencies.executeOutlineGeneration(runEnvelope, bibleContent, model, maxOutputTokens);
    const created = await loadOutline(runId);
    if (created) return created;
    throw new Error(`Failed to load chapter outline after creation for artifact ${result.artifactId}`);
  }

  async function acceptNonBlockingArtifactIfSafe(
    artifactId: string,
    overallScore: number,
  ) {
    const latestArtifact = await prisma.generatedArtifact.findUnique({
      where: { id: artifactId },
      select: { id: true, artifactType: true, title: true },
    });

    if (!latestArtifact) return false;

    const category = dependencies.getArtifactCategory(latestArtifact.artifactType);
    if (!['planning', 'reference'].includes(category)) {
      return false;
    }

    await prisma.generatedArtifact.update({
      where: { id: latestArtifact.id },
      data: { status: 'accepted' },
    });

    await dependencies.publishGenerationEvent(runId, {
      type: 'run_warning',
      runId,
      message: `Accepted ${latestArtifact.artifactType} "${latestArtifact.title}" after revision exhaustion with score ${overallScore}. Proceeding because it is not export-critical.`,
      severity: 'warning',
    });

    return true;
  }

  async function runAndValidatePreflight(progressPercent: number) {
    await publishProgress('assembling', progressPercent);
    const preflight = await dependencies.runPreflight(runEnvelope) as StoredPreflightResult;

    await publishPreflightWarnings(runId, dependencies.publishGenerationEvent, preflight);

    if (!preflight.passed) {
      const errorMsgs = preflight.issues
        .filter((issue) => issue.severity === 'error')
        .map((issue) => issue.message)
        .join('; ');
      throw new Error(`Preflight failed: ${errorMsgs || 'compiled document validation reported blocking issues'}`);
    }

    return preflight;
  }

  async function resolveFinalPresentationNode() {
    const runRecord = await prisma.generationRun.findUniqueOrThrow({
      where: { id: runId },
      select: { mode: true },
    });

    return runRecord.mode === 'one_shot' ? 'art_direction' : 'layout_director';
  }

  try {
    await dependencies.updateRunGraphState(runId, userId, {
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      queueName: 'generation',
      resumedFromCheckpoint: Boolean(readRuntimeState(fullRun.graphStateJson)),
    });

    const graphResult = await runPersistedGraph<GenerationGraphData, undefined>({
      startNode: 'intake',
      initialData: {
        latestPreflight: null,
        needsPreflightRecheck: false,
        quickModeAccepted: false,
        manualReviewRecheckPending: false,
      },
      loadSnapshot: () => readRuntimeState(fullRun.graphStateJson),
      externalContext: undefined,
      checkControl: async () => loadGenerationControlState(runId),
      pauseBehavior: 'exit',
      persistSnapshot: async (snapshot) => {
        await dependencies.updateRunGraphState(runId, userId, buildRuntimePatch(
          snapshot,
          fullRun.graphCheckpointKey ?? null,
        ));
      },
      nodes: {
        intake: async () => {
          await setRunStatus('planning', 5);
          await ensureNormalizedInput();
          await publishProgress('planning', 15);
          return { nextNode: 'bible' };
        },

        bible: async () => {
          await setRunStatus('planning', 15);
          await ensureBibleContent();
          await publishProgress('planning', 30);
          return { nextNode: 'outline' };
        },

        outline: async () => {
          await setRunStatus('planning', 30);
          await ensureOutline();
          await publishProgress('planning', 40);
          return { nextNode: 'front_matter' };
        },

        front_matter: async () => {
          await setRunStatus('planning', 40);
          const existing = await loadArtifactByKey(runId, 'front-matter');
          if (!existing) {
            const [bibleContent, outline] = await Promise.all([
              ensureBibleContent(),
              ensureOutline(),
            ]);
            await dependencies.executeFrontMatterGeneration(runEnvelope, bibleContent, outline);
          }
          return { nextNode: 'canon_expansion' };
        },

        canon_expansion: async () => {
          await setRunStatus('generating_assets', 45);
          const bibleContent = await ensureBibleContent();
          const entities = await prisma.canonEntity.findMany({
            where: { runId, projectId },
            orderBy: { createdAt: 'asc' },
            select: {
              id: true,
              entityType: true,
              slug: true,
              canonicalName: true,
              summary: true,
            },
          });

          const eligibleEntities = entities.filter((entity) =>
            SUPPORTED_CANON_ENTITY_TYPES[entity.entityType] && bibleContent.entities.some((seed) => seed.slug === entity.slug),
          );
          const artifactKeys = eligibleEntities.map((entity) =>
            `${SUPPORTED_CANON_ENTITY_TYPES[entity.entityType]}-${entity.slug}`,
          );
          const existingKeys = await loadArtifactKeySet(runId, artifactKeys);
          const nextEntity = eligibleEntities.find((entity) =>
            !existingKeys.has(`${SUPPORTED_CANON_ENTITY_TYPES[entity.entityType]}-${entity.slug}`),
          );

          if (!nextEntity) {
            await publishProgress('generating_assets', 55);
            return { nextNode: 'chapter_plans' };
          }

          const seed = bibleContent.entities.find((candidate) => candidate.slug === nextEntity.slug);
          if (!seed) {
            return { nextNode: 'canon_expansion' };
          }

          const { model, maxOutputTokens } = await resolveModelForAgent('agent.canon');
          await dependencies.expandCanonEntity(
            runEnvelope,
            nextEntity,
            seed,
            bibleContent,
            model,
            maxOutputTokens,
          );

          const completedCount = eligibleEntities.length === 0
            ? 0
            : eligibleEntities.length - 1;
          const nextPercent = 45 + Math.round(((completedCount + 1) / Math.max(1, eligibleEntities.length)) * 10);
          await publishProgress('generating_assets', nextPercent);

          return { nextNode: 'canon_expansion' };
        },

        chapter_plans: async () => {
          await setRunStatus('generating_assets', 55);
          const [outline, bibleContent, enrichedEntities] = await Promise.all([
            ensureOutline(),
            ensureBibleContent(),
            prisma.canonEntity.findMany({
              where: { runId, projectId },
              select: { slug: true, entityType: true, canonicalName: true, summary: true },
            }),
          ]);

          const planKeys = outline.chapters.map((chapter) => `chapter-plan-${chapter.slug}`);
          const existingKeys = await loadArtifactKeySet(runId, planKeys);
          const nextChapter = outline.chapters.find((chapter) => !existingKeys.has(`chapter-plan-${chapter.slug}`));

          if (!nextChapter) {
            await publishProgress('generating_assets', 65);
            return { nextNode: 'chapter_drafts' };
          }

          const { model, maxOutputTokens } = await resolveModelForAgent('agent.chapter_plan');
          await dependencies.executeChapterPlanGeneration(
            runEnvelope,
            nextChapter,
            bibleContent,
            enrichedEntities.map((entity) => ({
              slug: entity.slug,
              entityType: entity.entityType,
              name: entity.canonicalName,
              summary: entity.summary ?? '',
            })),
            model,
            maxOutputTokens,
          );

          const completedCount = outline.chapters.filter((chapter) =>
            existingKeys.has(`chapter-plan-${chapter.slug}`),
          ).length + 1;
          await publishProgress(
            'generating_assets',
            55 + Math.round((completedCount / Math.max(1, outline.chapters.length)) * 10),
          );

          return { nextNode: 'chapter_plans' };
        },

        chapter_drafts: async () => {
          await setRunStatus('generating_prose', 65);
          const [outline, bibleContent] = await Promise.all([
            ensureOutline(),
            ensureBibleContent(),
          ]);

          const draftKeys = outline.chapters.map((chapter) => `chapter-draft-${chapter.slug}`);
          const existingDraftKeys = await loadArtifactKeySet(runId, draftKeys);
          const nextChapter = outline.chapters.find((chapter) => !existingDraftKeys.has(`chapter-draft-${chapter.slug}`));

          if (!nextChapter) {
            await publishProgress('generating_prose', isPolished ? 80 : 88);
            return { nextNode: isPolished ? 'evaluation' : 'assembly' };
          }

          const planArtifact = await loadArtifactByKey(runId, `chapter-plan-${nextChapter.slug}`);
          if (!planArtifact?.jsonContent) {
            throw new Error(`No plan found for chapter ${nextChapter.slug}`);
          }

          const priorSlugs = outline.chapters
            .slice(0, outline.chapters.findIndex((chapter) => chapter.slug === nextChapter.slug))
            .map((chapter) => chapter.slug);

          const { model, maxOutputTokens } = await resolveModelForAgent('agent.chapter_draft');
          await dependencies.executeChapterDraftGeneration(
            runEnvelope,
            nextChapter,
            planArtifact.jsonContent as any,
            bibleContent,
            priorSlugs,
            model,
            maxOutputTokens,
          );

          const completedCount = outline.chapters.filter((chapter) =>
            existingDraftKeys.has(`chapter-draft-${chapter.slug}`),
          ).length + 1;
          await publishProgress(
            'generating_prose',
            65 + Math.round((completedCount / Math.max(1, outline.chapters.length)) * 15),
          );

          return { nextNode: 'chapter_drafts' };
        },

        evaluation: async ({ data }) => {
          if (!isPolished) {
            if (!data.quickModeAccepted) {
              await prisma.generatedArtifact.updateMany({
                where: { runId, status: 'generated' },
                data: { status: 'accepted' },
              });
            }
            return {
              nextNode: 'assembly',
              data: { quickModeAccepted: true },
            };
          }

          await setRunStatus('evaluating', 80);
          const allArtifacts = await prisma.generatedArtifact.findMany({
            where: { runId },
            orderBy: [{ artifactKey: 'asc' }, { version: 'desc' }, { createdAt: 'desc' }],
          });

          const latestByKey = new Map<string, typeof allArtifacts[number]>();
          for (const artifact of allArtifacts) {
            if (!latestByKey.has(artifact.artifactKey)) {
              latestByKey.set(artifact.artifactKey, artifact);
            }
          }

          const nextArtifact = [...latestByKey.values()].find((artifact) =>
            artifact.status === 'generated' || artifact.status === 'failed_evaluation',
          );

          if (!nextArtifact) {
            return { nextNode: 'assembly' };
          }

          const bibleContent = await ensureBibleContent();
          let currentArtifactId = nextArtifact.id;
          const evaluatorModel = await resolveModelForAgent('agent.evaluator');
          const reviserModel = await resolveModelForAgent('agent.reviser');
          let evalResult = await dependencies.evaluateArtifact(
            { id: runId },
            currentArtifactId,
            bibleContent,
            evaluatorModel.model,
            evaluatorModel.maxOutputTokens,
          );
          const artifactCategory = dependencies.getArtifactCategory(nextArtifact.artifactType);

          if (!evalResult.passed && !REVISION_ELIGIBLE_CATEGORIES.has(artifactCategory)) {
            await acceptNonBlockingArtifactIfSafe(
              currentArtifactId,
              evalResult.overallScore,
            );
            return { nextNode: 'evaluation' };
          }

          if (!evalResult.passed) {
            await setRunStatus('revising', 84);
              const revised = await dependencies.reviseArtifact(
                { id: runId },
                currentArtifactId,
                evalResult.findings,
                bibleContent,
                reviserModel.model,
                reviserModel.maxOutputTokens,
              );
              if (revised) {
                currentArtifactId = revised.newArtifactId;
                evalResult = await dependencies.evaluateArtifact(
                  { id: runId },
                  currentArtifactId,
                  bibleContent,
                  evaluatorModel.model,
                  evaluatorModel.maxOutputTokens,
                );
                if (!evalResult.passed) {
                  const revisedAgain = await dependencies.reviseArtifact(
                    { id: runId },
                    currentArtifactId,
                    evalResult.findings,
                    bibleContent,
                    reviserModel.model,
                    reviserModel.maxOutputTokens,
                  );
                  if (revisedAgain) {
                    currentArtifactId = revisedAgain.newArtifactId;
                    evalResult = await dependencies.evaluateArtifact(
                      { id: runId },
                      currentArtifactId,
                      bibleContent,
                      evaluatorModel.model,
                      evaluatorModel.maxOutputTokens,
                    );
                  }
                }
            }

            if (!evalResult.passed) {
              await acceptNonBlockingArtifactIfSafe(
                currentArtifactId,
                evalResult.overallScore,
              );
            }
          }

          await setRunStatus('evaluating', 88);
          return { nextNode: 'evaluation' };
        },

        assembly: async () => {
          await setRunStatus('assembling', 90);
          const [manifest, documentCount] = await Promise.all([
            prisma.assemblyManifest.findFirst({
              where: { runId, projectId, status: 'assembled' },
              orderBy: { createdAt: 'desc' },
              select: { id: true },
            }),
            prisma.projectDocument.count({
              where: { runId, projectId },
            }),
          ]);

          if (!manifest || documentCount === 0) {
            await dependencies.assembleDocuments(runEnvelope);
          }

          await publishProgress('assembling', 90);
          return { nextNode: 'preflight' };
        },

        preflight: async () => {
          const preflight = await runAndValidatePreflight(92);
          return {
            nextNode: 'publication_polish',
            data: {
              latestPreflight: preflight,
              needsPreflightRecheck: false,
            },
          };
        },

        publication_polish: async ({ data }) => {
          await publishProgress('assembling', 94);
          const preflight = data.latestPreflight ?? await runAndValidatePreflight(92);
          const polish = await dependencies.executePublicationPolish(runEnvelope, preflight);

          if (polish.operationsApplied > 0) {
            await dependencies.publishGenerationEvent(runId, {
              type: 'run_warning',
              runId,
              message: `Publication polish applied ${polish.operationsApplied} structural fix(es) across ${polish.documentsUpdated} document(s).`,
              severity: 'info',
            });
          } else if (polish.polishableIssuesSeen > 0) {
            await dependencies.publishGenerationEvent(runId, {
              type: 'run_warning',
              runId,
              message: `Publication polish found ${polish.polishableIssuesSeen} polishable issue(s) but no safe automatic fixes were available.`,
              severity: 'warning',
            });
          }

          return {
            nextNode: polish.documentsUpdated > 0
              ? 'preflight_recheck'
              : 'publication_review_gate',
            data: {
              latestPreflight: preflight,
              needsPreflightRecheck: polish.documentsUpdated > 0,
            },
          };
        },

        preflight_recheck: async () => {
          const preflight = await runAndValidatePreflight(97);

          return {
            nextNode: 'publication_review_gate',
            data: {
              latestPreflight: preflight,
              needsPreflightRecheck: false,
            },
          };
        },

        publication_review_gate: async ({ data }) => {
          await publishProgress('assembling', 98);

          const interruptResult = await dependencies.ensureGenerationRunInterrupt({
            runId,
            userId,
            interruptKey: 'generation:publication-review',
            kind: 'manual_review',
            title: 'Review assembled draft before final presentation',
            summary: 'Review the assembled draft before the final art and layout passes. Approve to continue, request edit to make manual document changes and then resume, or reject to stop the run.',
            payload: {
              stage: 'publication_review_gate',
            },
          });

          if (!interruptResult) {
            throw new Error('Failed to persist publication review gate.');
          }

          if (interruptResult.interrupt.status === 'pending') {
            const pausedRun = await dependencies.transitionRunStatus(runId, userId, 'paused');

            if (interruptResult.created) {
              await dependencies.publishGenerationEvent(runId, {
                type: 'run_warning',
                runId,
                message: 'Awaiting manual review before final presentation passes.',
                severity: 'info',
              });
            }

            await dependencies.publishGenerationEvent(runId, {
              type: 'run_status',
              runId,
              status: pausedRun?.status ?? 'paused',
              stage: pausedRun?.currentStage ?? 'assembling',
              progressPercent: pausedRun?.progressPercent ?? 98,
            });

            return { nextNode: 'publication_review_gate' };
          }

          if (interruptResult.interrupt.status === 'rejected') {
            return { nextNode: null };
          }

          if (interruptResult.interrupt.status === 'edited' && !data.manualReviewRecheckPending) {
            const note = readResolutionNote(interruptResult.interrupt.resolutionPayload);
            if (note) {
              await dependencies.publishGenerationEvent(runId, {
                type: 'run_warning',
                runId,
                message: `Manual reviewer requested edits before completion: ${note}`,
                severity: 'info',
              });
            }

            return {
              nextNode: 'preflight',
              data: {
                latestPreflight: null,
                needsPreflightRecheck: false,
                manualReviewRecheckPending: true,
              },
            };
          }

          return {
            nextNode: await resolveFinalPresentationNode(),
            data: {
              manualReviewRecheckPending: false,
            },
          };
        },

        art_direction: async () => {
          await publishProgress('assembling', 99);

          const existing = await loadArtifactByKey(runId, 'art-direction-plan');
          if (!existing) {
            try {
              const artDirection = await withOptionalStageTimeout(
                'Art direction pass',
                (async () => {
                  const { model, maxOutputTokens } = await resolveModelForAgent('agent.layout');
                  return dependencies.executeArtDirectionPass(runEnvelope, model, maxOutputTokens);
                })(),
              );
              if (artDirection.generatedImageCount > 0) {
                await dependencies.publishGenerationEvent(runId, {
                  type: 'run_warning',
                  runId,
                  message: `Art direction automatically generated ${artDirection.generatedImageCount} project image asset(s) across ${artDirection.placementCount} selected placement(s).`,
                  severity: 'info',
                });
              } else if (artDirection.placementCount > 0 && artDirection.skippedImageGenerationReason) {
                await dependencies.publishGenerationEvent(runId, {
                  type: 'run_warning',
                  runId,
                  message: `Art direction selected ${artDirection.placementCount} image placement(s), but automatic image generation was skipped: ${artDirection.skippedImageGenerationReason}`,
                  severity: 'warning',
                });
              } else if (artDirection.placementCount > 0 && artDirection.failedImageCount > 0) {
                await dependencies.publishGenerationEvent(runId, {
                  type: 'run_warning',
                  runId,
                  message: `Art direction planned ${artDirection.placementCount} image placement(s), but ${artDirection.failedImageCount} image generation attempt(s) failed.`,
                  severity: 'warning',
                });
              }
            } catch (artErr) {
              const message = artErr instanceof Error ? artErr.message : String(artErr);
              await dependencies.publishGenerationEvent(runId, {
                type: 'run_warning',
                runId,
                message: `Art direction pass failed: ${message}`,
                severity: 'warning',
              });
            }
          }

          return { nextNode: 'layout_director' };
        },

        layout_director: async () => {
          await publishProgress('assembling', 99);
          const existing = await loadArtifactByKey(runId, 'layout-plan');

          if (!existing) {
            try {
              const layoutDirector = await withOptionalStageTimeout(
                'Layout director pass',
                dependencies.executeLayoutDirectorPass(runEnvelope),
              );
              if (layoutDirector.documentsUpdated > 0) {
                await dependencies.publishGenerationEvent(runId, {
                  type: 'run_warning',
                  runId,
                  message: `Layout director refreshed canonical presentation plans for ${layoutDirector.documentsUpdated} document(s).`,
                  severity: 'info',
                });
              }
            } catch (layoutErr) {
              const message = layoutErr instanceof Error ? layoutErr.message : String(layoutErr);
              await dependencies.publishGenerationEvent(runId, {
                type: 'run_warning',
                runId,
                message: `Layout director pass failed: ${message}`,
                severity: 'warning',
              });
            }
          }

          return { nextNode: null };
        },
      },
    });

    if (graphResult.outcome === 'paused' || graphResult.outcome === 'cancelled') {
      const current = await prisma.generationRun.findUnique({
        where: { id: runId },
        select: { status: true, progressPercent: true },
      });

      if (current) {
        await dependencies.publishGenerationEvent(runId, {
          type: 'run_status',
          runId,
          status: current.status,
          stage: current.status,
          progressPercent: current.progressPercent,
        });
      }
      return;
    }

    await dependencies.transitionRunStatus(runId, userId, 'completed');
    await dependencies.publishGenerationEvent(runId, { type: 'run_completed', runId });
    console.log(`[generation] Run ${runId} completed`);
  } catch (error: unknown) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    const willRetry = hasRetryRemaining(job);
    console.error(`[generation] Run ${runId} failed:`, message);

    try {
      await dependencies.updateRunGraphState(runId, userId, {
        lastError: message,
        lastErrorAt: new Date().toISOString(),
        retryPending: willRetry,
        attemptsMade: job.attemptsMade,
      });

      if (willRetry) {
        await dependencies.publishGenerationEvent(runId, {
          type: 'run_warning',
          runId,
          message: `Generation worker attempt ${job.attemptsMade + 1} failed and will retry: ${message}`,
          severity: 'warning',
        });
      } else {
        await dependencies.transitionRunStatus(runId, userId, 'failed', message);
        await dependencies.publishGenerationEvent(runId, {
          type: 'run_failed',
          runId,
          reason: message,
        });
      }
    } catch (dbErr) {
      console.error('[generation] Failed to update run state after orchestration error:', dbErr);
    }

    throw error;
  }
}
