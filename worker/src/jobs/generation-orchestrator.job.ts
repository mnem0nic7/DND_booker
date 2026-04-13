import type { Job } from 'bullmq';
import type {
  BibleContent,
  ChapterOutline,
  InterviewBrief,
  NormalizedInput,
  QualityBudgetLane,
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
  criticCycle: number;
  latestCriticReportId: string | null;
  latestPreviewExportJobId: string | null;
  latestPreviewExportReview: Record<string, unknown> | null;
  finalEditorRewriteUsed: boolean;
  imageGenerationStatus: 'not_requested' | 'requested' | 'processing' | 'completed' | 'failed';
  qualityBudgetLane: QualityBudgetLane;
  routedRewriteCounts: {
    writer: number;
    dndExpert: number;
    layoutExpert: number;
    artist: number;
  };
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

const MAX_CRITIC_CYCLES = 4;

const DEFAULT_OPTIONAL_STAGE_TIMEOUT_MS = 4 * 60 * 1000;
const DEFAULT_CORE_STAGE_TIMEOUT_MS = 6 * 60 * 1000;
const DEFAULT_ARTIST_STAGE_TIMEOUT_MS = 12 * 60 * 1000;
const DEFAULT_CRITIC_STAGE_TIMEOUT_MS = 15 * 60 * 1000;
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function resolveCoreStageTimeoutMs(): number {
  const parsed = Number.parseInt(process.env.GENERATION_CORE_STAGE_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return DEFAULT_CORE_STAGE_TIMEOUT_MS;
}

function resolveConfiguredStageTimeoutMs(envName: string, fallbackMs: number): number {
  const parsed = Number.parseInt(process.env[envName] ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackMs;
}

async function withStageTimeout<T>(label: string, task: Promise<T>, timeoutMs: number): Promise<T> {
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

async function withOptionalStageTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  return withStageTimeout(label, task, resolveOptionalStageTimeoutMs());
}

async function withCoreStageTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  return withStageTimeout(label, task, resolveCoreStageTimeoutMs());
}

async function withArtistStageTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  return withStageTimeout(
    label,
    task,
    resolveConfiguredStageTimeoutMs('GENERATION_ARTIST_STAGE_TIMEOUT_MS', DEFAULT_ARTIST_STAGE_TIMEOUT_MS),
  );
}

async function withCriticStageTimeout<T>(label: string, task: Promise<T>): Promise<T> {
  return withStageTimeout(
    label,
    task,
    resolveConfiguredStageTimeoutMs('GENERATION_CRITIC_STAGE_TIMEOUT_MS', DEFAULT_CRITIC_STAGE_TIMEOUT_MS),
  );
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
  const agenticArtifactsService = await import('../../../server/src/services/generation/agentic-artifacts.service.js');
  const finalEditorService = await import('../../../server/src/services/generation/final-editor.service.js');
  const exportService = await import('../../../server/src/services/export.service.js');
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
    ...agenticArtifactsService,
    ...finalEditorService,
    ...exportService,
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

function readInterviewBrief(inputParameters: unknown): InterviewBrief | null {
  if (!isRecord(inputParameters)) return null;
  const brief = inputParameters.interviewBrief;
  return isRecord(brief) ? brief as unknown as InterviewBrief : null;
}

function readQualityBudgetLane(inputParameters: unknown, runQuality: string | null | undefined): QualityBudgetLane {
  const lane = isRecord(inputParameters) ? inputParameters.qualityBudgetLane : null;
  if (lane === 'fast' || lane === 'balanced' || lane === 'high_quality') {
    return lane;
  }

  if (runQuality === 'quick') {
    return 'fast';
  }

  if (runQuality === 'polished') {
    return 'high_quality';
  }

  return 'balanced';
}

async function waitForExportCompletion(exportJobId: string) {
  const timeoutAt = Date.now() + 20 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const exportJob = await prisma.exportJob.findUnique({
      where: { id: exportJobId },
      select: {
        id: true,
        status: true,
        errorMessage: true,
        reviewJson: true,
        outputUrl: true,
      },
    });

    if (!exportJob) {
      throw new Error('Export job not found.');
    }

    if (exportJob.status === 'completed') {
      return exportJob;
    }

    if (exportJob.status === 'failed') {
      throw new Error(exportJob.errorMessage?.trim() || 'Export failed.');
    }

    await sleep(2000);
  }

  throw new Error('Timed out waiting for export completion.');
}

function selectRewriteOwner(routedRewriteCounts: GenerationGraphData['routedRewriteCounts']) {
  const ordered = [
    ['writer', routedRewriteCounts.writer],
    ['dndExpert', routedRewriteCounts.dndExpert],
    ['layoutExpert', routedRewriteCounts.layoutExpert],
    ['artist', routedRewriteCounts.artist],
  ] as const;

  const next = ordered
    .filter((entry) => entry[1] > 0)
    .sort((left, right) => right[1] - left[1])[0];

  return next?.[0] ?? null;
}

const QUICK_MODE_GOOGLE_FLASH_AGENT_KEYS = new Set([
  'agent.bible',
  'agent.outline',
  'agent.canon',
  'agent.chapter_draft',
  'agent.layout',
]);

export function shouldPreferQuickModeGoogleFlash(agentKey: string, isPolished: boolean) {
  return !isPolished && QUICK_MODE_GOOGLE_FLASH_AGENT_KEYS.has(agentKey);
}

async function resolveModelForRun(budgetLane: QualityBudgetLane) {
  const { resolveSystemAgentLanguageModel } = await import('../../../server/src/services/llm/system-router.js');

  const resolvedModels = new Map<string, Awaited<ReturnType<typeof resolveSystemAgentLanguageModel>>>();

  return async (agentKey: string) => {
    const cached = resolvedModels.get(agentKey);
    if (cached) {
      return cached;
    }

    const resolved = await resolveSystemAgentLanguageModel(agentKey, budgetLane);
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
  const interviewBrief = readInterviewBrief(fullRun.inputParameters);
  const qualityBudgetLane = readQualityBudgetLane(fullRun.inputParameters, fullRun.quality);
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
  const dependencies = await loadGenerationDependencies();
  const resolveModelForAgent = await resolveModelForRun(qualityBudgetLane);

  async function publishProgress(status: RunStatus, progressPercent: number) {
    const currentRun = await prisma.generationRun.findUnique({
      where: { id: runId },
      select: { graphStateJson: true },
    });
    const graphState = isRecord(currentRun?.graphStateJson) ? currentRun!.graphStateJson as Record<string, unknown> : null;
    const updated = await dependencies.updateRunProgress(runId, userId, status, progressPercent);
    await dependencies.publishGenerationEvent(runId, {
      type: 'run_status',
      runId,
      status,
      stage: status,
      progressPercent: updated?.progressPercent ?? progressPercent,
      agentStage: typeof graphState?.agentStage === 'string' ? graphState.agentStage : null,
      criticCycle: typeof graphState?.criticCycle === 'number' ? graphState.criticCycle : null,
      qualityBudgetLane:
        graphState?.qualityBudgetLane === 'fast'
        || graphState?.qualityBudgetLane === 'balanced'
        || graphState?.qualityBudgetLane === 'high_quality'
          ? graphState.qualityBudgetLane
          : qualityBudgetLane,
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

  async function setAgentStage(
    agentStage: string,
    status: RunStatus,
    progressPercent: number,
    patch: Record<string, unknown> = {},
  ) {
    await dependencies.updateRunGraphState(runId, userId, {
      agentStage,
      qualityBudgetLane,
      ...patch,
    });
    await setRunStatus(status, progressPercent);
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

    if (interviewBrief) {
      const normalizedInput = dependencies.buildNormalizedInputFromInterviewBrief(interviewBrief);
      const artifact = await prisma.generatedArtifact.create({
        data: {
          runId,
          projectId,
          artifactType: 'project_profile',
          artifactKey: 'project-profile',
          status: 'accepted',
          version: 1,
          title: normalizedInput.title,
          summary: normalizedInput.summary,
          jsonContent: normalizedInput as any,
        },
      });

      await prisma.generationRun.update({
        where: { id: runId },
        data: {
          mode: normalizedInput.inferredMode,
          estimatedPages: normalizedInput.pageTarget,
          actualTokens: { increment: 0 },
        },
      });

      await dependencies.publishGenerationEvent(runId, {
        type: 'artifact_created',
        runId,
        artifactId: artifact.id,
        artifactType: 'project_profile',
        title: artifact.title,
        version: artifact.version,
      });

      return normalizedInput;
    }

    const { model, maxOutputTokens } = await resolveModelForAgent('agent.writer');
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

  async function listLatestArtifacts() {
    const artifacts = await prisma.generatedArtifact.findMany({
      where: { runId },
      orderBy: [{ artifactKey: 'asc' }, { version: 'desc' }, { createdAt: 'desc' }],
      include: {
        evaluations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const latestByKey = new Map<string, typeof artifacts[number]>();
    for (const artifact of artifacts) {
      if (!latestByKey.has(artifact.artifactKey)) {
        latestByKey.set(artifact.artifactKey, artifact);
      }
    }

    return [...latestByKey.values()];
  }

  async function evaluateLatestArtifacts() {
    const bibleContent = await ensureBibleContent();
    const latestArtifacts = await listLatestArtifacts();
    const evaluatorModel = await resolveModelForAgent('agent.critic');

    for (const artifact of latestArtifacts) {
      const latestEvaluation = artifact.evaluations[0];
      if (latestEvaluation?.artifactVersion === artifact.version) {
        continue;
      }

      await dependencies.evaluateArtifact(
        { id: runId },
        artifact.id,
        bibleContent,
        evaluatorModel.model,
        evaluatorModel.maxOutputTokens,
      );
    }
  }

  async function findLatestArtifactForOwner(owner: 'writer' | 'dndExpert' | 'layoutExpert' | 'artist') {
    const latestArtifacts = await listLatestArtifacts();
    const matchesOwner = (artifactType: string) => {
      if (owner === 'writer') {
        return ['project_profile', 'campaign_bible', 'chapter_outline', 'chapter_plan', 'chapter_draft', 'front_matter_draft', 'writer_story_packet'].includes(artifactType);
      }
      if (owner === 'dndExpert') {
        return ['npc_dossier', 'location_brief', 'faction_profile', 'encounter_bundle', 'item_bundle', 'read_aloud_bundle', 'sidebar_bundle', 'handout_bundle', 'random_table_bundle', 'stat_block_bundle', 'loot_bundle'].includes(artifactType);
      }
      if (owner === 'artist') {
        return ['image_asset', 'image_brief_bundle', 'art_direction_plan'].includes(artifactType);
      }
      return ['layout_plan', 'layout_draft', 'assembly_manifest', 'art_direction_plan'].includes(artifactType);
    };

    const scored = latestArtifacts
      .filter((artifact) => matchesOwner(artifact.artifactType))
      .map((artifact) => ({
        artifact,
        evaluation: artifact.evaluations[0] ?? null,
      }))
      .filter((entry) => entry.evaluation && entry.evaluation.passed === false)
      .sort((left, right) => (left.evaluation?.overallScore ?? 0) - (right.evaluation?.overallScore ?? 0));

    return scored[0] ?? null;
  }

  try {
    await dependencies.updateRunGraphState(runId, userId, {
      jobName: job.name,
      attemptsMade: job.attemptsMade,
      queueName: 'generation',
      resumedFromCheckpoint: Boolean(readRuntimeState(fullRun.graphStateJson)),
    });

    const graphResult = await runPersistedGraph<GenerationGraphData, undefined>({
      startNode: 'interview_locked',
      initialData: {
        criticCycle: 0,
        latestCriticReportId: null,
        latestPreviewExportJobId: null,
        latestPreviewExportReview: null,
        finalEditorRewriteUsed: false,
        imageGenerationStatus: 'not_requested',
        qualityBudgetLane,
        routedRewriteCounts: {
          writer: 0,
          dndExpert: 0,
          layoutExpert: 0,
          artist: 0,
        },
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
        interview_locked: async () => withCoreStageTimeout('Interview locked node', (async () => {
          await setAgentStage('interview_locked', 'planning', 5, {
            criticCycle: 0,
            qualityBudgetLane,
            imageGenerationStatus: 'not_requested',
            finalEditorialStatus: 'pending',
          });
          await ensureNormalizedInput();
          await publishProgress('planning', 10);
          return { nextNode: 'writer_story_packet' };
        })()),

        writer_story_packet: async () => withCoreStageTimeout('Writer story packet node', (async () => {
          await setAgentStage('writer_story_packet', 'planning', 10);
          const [bibleContent, outline] = await Promise.all([
            ensureBibleContent(),
            ensureOutline(),
          ]);

          const frontMatter = await loadArtifactByKey(runId, 'front-matter');
          if (!frontMatter) {
            await dependencies.executeFrontMatterGeneration(runEnvelope, bibleContent, outline);
          }

          const existingPlanKeys = await loadArtifactKeySet(
            runId,
            outline.chapters.map((chapter) => `chapter-plan-${chapter.slug}`),
          );
          const enrichedEntities = await prisma.canonEntity.findMany({
            where: { runId, projectId },
            select: { slug: true, entityType: true, canonicalName: true, summary: true },
          });

          for (const chapter of outline.chapters) {
            if (!existingPlanKeys.has(`chapter-plan-${chapter.slug}`)) {
              const { model, maxOutputTokens } = await resolveModelForAgent('agent.writer');
              await dependencies.executeChapterPlanGeneration(
                runEnvelope,
                chapter,
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
            }
          }

          const existingDraftKeys = await loadArtifactKeySet(
            runId,
            outline.chapters.map((chapter) => `chapter-draft-${chapter.slug}`),
          );
          for (const chapter of outline.chapters) {
            if (existingDraftKeys.has(`chapter-draft-${chapter.slug}`)) continue;

            const planArtifact = await loadArtifactByKey(runId, `chapter-plan-${chapter.slug}`);
            if (!planArtifact?.jsonContent) {
              throw new Error(`No plan found for chapter ${chapter.slug}`);
            }

            const priorSlugs = outline.chapters
              .slice(0, outline.chapters.findIndex((candidate) => candidate.slug === chapter.slug))
              .map((candidate) => candidate.slug);

            const { model, maxOutputTokens } = await resolveModelForAgent('agent.writer');
            await dependencies.executeChapterDraftGeneration(
              runEnvelope,
              chapter,
              planArtifact.jsonContent as any,
              bibleContent,
              priorSlugs,
              model,
              maxOutputTokens,
            );
          }

          await dependencies.ensureWriterStoryPacketArtifact(runEnvelope);
          await publishProgress('planning', 45);
          return { nextNode: 'dnd_expert_inserts' };
        })()),

        dnd_expert_inserts: async () => withCoreStageTimeout('DND expert inserts node', (async () => {
          await setAgentStage('dnd_expert_inserts', 'generating_assets', 45);
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

          for (const entity of eligibleEntities) {
            const artifactKey = `${SUPPORTED_CANON_ENTITY_TYPES[entity.entityType]}-${entity.slug}`;
            if (existingKeys.has(artifactKey)) continue;
            const seed = bibleContent.entities.find((candidate) => candidate.slug === entity.slug);
            if (!seed) continue;
            const { model, maxOutputTokens } = await resolveModelForAgent('agent.dnd_expert');
            await dependencies.expandCanonEntity(
              runEnvelope,
              entity,
              seed,
              bibleContent,
              model,
              maxOutputTokens,
            );
          }

          await dependencies.ensureInsertBundleArtifacts(runEnvelope);
          await publishProgress('generating_assets', 60);
          return { nextNode: 'layout_first_draft' };
        })()),

        layout_first_draft: async () => withCoreStageTimeout('Layout first draft node', (async () => {
          await setAgentStage('layout_first_draft', 'assembling', 60);
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

          const preflight = await runAndValidatePreflight(68);
          const polish = await dependencies.executePublicationPolish(runEnvelope, preflight);
          if (polish.documentsUpdated > 0) {
            await runAndValidatePreflight(70);
          }

          await withOptionalStageTimeout(
            'Layout director pass',
            dependencies.executeLayoutDirectorPass(runEnvelope),
          );
          await dependencies.ensureLayoutDraftArtifacts(runEnvelope);
          await publishProgress('assembling', 72);
          return { nextNode: 'critic_text_pass' };
        })()),

        critic_text_pass: async ({ data }) => withCriticStageTimeout('Critic text pass node', (async () => {
          const cycle = (data.criticCycle ?? 0) + 1;
          await setAgentStage('critic_text_pass', 'evaluating', 74, { criticCycle: cycle });
          await evaluateLatestArtifacts();
          const criticReportArtifact = await dependencies.createCriticReportArtifact({
            runId,
            projectId,
            cycle,
            stage: 'critic_text_pass',
          });
          const criticReport = criticReportArtifact.jsonContent as Record<string, unknown>;
          const routedRewriteCounts = (criticReport.routedRewriteCounts ?? {
            writer: 0,
            dndExpert: 0,
            layoutExpert: 0,
            artist: 0,
          }) as GenerationGraphData['routedRewriteCounts'];

          await dependencies.updateRunGraphState(runId, userId, {
            agentStage: 'critic_text_pass',
            criticCycle: cycle,
            latestCriticReportId: criticReportArtifact.id,
            routedRewriteCounts,
          });

          if (criticReport.passed === true) {
            return {
              nextNode: 'artist_requested',
              data: {
                ...data,
                criticCycle: cycle,
                latestCriticReportId: criticReportArtifact.id,
                routedRewriteCounts,
              },
            };
          }

          if (cycle >= MAX_CRITIC_CYCLES) {
            if ((criticReport.blockingFindingCount as number ?? 0) === 0 && (criticReport.overallScore as number ?? 0) >= 75) {
              return {
                nextNode: 'final_editor',
                data: {
                  ...data,
                  criticCycle: cycle,
                  latestCriticReportId: criticReportArtifact.id,
                  routedRewriteCounts,
                },
              };
            }

            throw new Error('Text critic loop exhausted before the draft reached printable quality.');
          }

          const owner = selectRewriteOwner(routedRewriteCounts);
          return {
            nextNode:
              owner === 'writer' ? 'rewrite_writer'
                : owner === 'dndExpert' ? 'rewrite_dnd_expert'
                  : 'rewrite_layout',
            data: {
              ...data,
              criticCycle: cycle,
              latestCriticReportId: criticReportArtifact.id,
              routedRewriteCounts,
            },
          };
        })()),

        rewrite_writer: async ({ data }) => withCoreStageTimeout('Writer rewrite node', (async () => {
          await setAgentStage('rewrite_writer', 'revising', 76);
          const failed = await findLatestArtifactForOwner('writer');
          if (!failed?.evaluation) {
            return { nextNode: 'layout_first_draft' };
          }

          const bibleContent = await ensureBibleContent();
          const { model, maxOutputTokens } = await resolveModelForAgent('agent.writer');
          await dependencies.reviseArtifact(
            { id: runId },
            failed.artifact.id,
            failed.evaluation.findings as any,
            bibleContent,
            model,
            maxOutputTokens,
          );

          return { nextNode: 'dnd_expert_inserts', data };
        })()),

        rewrite_dnd_expert: async ({ data }) => withCoreStageTimeout('DND expert rewrite node', (async () => {
          await setAgentStage('rewrite_dnd_expert', 'revising', 77);
          const failed = await findLatestArtifactForOwner('dndExpert');
          if (failed?.evaluation) {
            const bibleContent = await ensureBibleContent();
            const { model, maxOutputTokens } = await resolveModelForAgent('agent.dnd_expert');
            await dependencies.reviseArtifact(
              { id: runId },
              failed.artifact.id,
              failed.evaluation.findings as any,
              bibleContent,
              model,
              maxOutputTokens,
            );
          }

          await dependencies.ensureInsertBundleArtifacts(runEnvelope);
          return { nextNode: 'layout_first_draft', data };
        })()),

        rewrite_layout: async ({ data }) => withCoreStageTimeout('Layout rewrite node', (async () => {
          await setAgentStage('rewrite_layout', 'revising', 78);
          await dependencies.executeLayoutDirectorPass(runEnvelope);
          await dependencies.ensureLayoutDraftArtifacts(runEnvelope);

          if (data.imageGenerationStatus === 'completed') {
            return { nextNode: 'critic_image_pass', data };
          }
          return { nextNode: 'critic_text_pass', data };
        })()),

        artist_requested: async ({ data }) => withArtistStageTimeout('Artist requested node', (async () => {
          await setAgentStage('artist_requested', 'assembling', 82, {
            imageGenerationStatus: 'processing',
          });
          const { resolveSystemAgentRoute } = await import('../../../server/src/services/llm/system-router.js');
          const artistRoute = await resolveSystemAgentRoute('agent.artist', qualityBudgetLane);
          const { model, maxOutputTokens } = await resolveModelForAgent('agent.artist');
          const artResult = await dependencies.executeArtDirectionPass(
            runEnvelope,
            model,
            maxOutputTokens,
            {
              systemImageProvider: artistRoute.provider === 'google' || artistRoute.provider === 'openai'
                ? artistRoute.provider
                : null,
              systemImageApiKey: process.env[artistRoute.credentialEnvName] ?? null,
            },
          );

          await dependencies.ensureLayoutDraftArtifacts(runEnvelope);

          await dependencies.updateRunGraphState(runId, userId, {
            imageGenerationStatus: artResult.failedImageCount > 0 && artResult.generatedImageCount === 0 ? 'failed' : 'completed',
          });

          return {
            nextNode: 'artist_completed',
            data: {
              ...data,
              imageGenerationStatus: artResult.failedImageCount > 0 && artResult.generatedImageCount === 0 ? 'failed' : 'completed',
            },
          };
        })()),

        artist_completed: async ({ data }) => {
          await setAgentStage('artist_completed', 'assembling', 86, {
            imageGenerationStatus: data.imageGenerationStatus ?? 'completed',
          });
          return { nextNode: 'critic_image_pass', data };
        },

        critic_image_pass: async ({ data }) => withCriticStageTimeout('Critic image pass node', (async () => {
          const cycle = (data.criticCycle ?? 0) + 1;
          await setAgentStage('critic_image_pass', 'evaluating', 88, {
            criticCycle: cycle,
            imageGenerationStatus: data.imageGenerationStatus ?? 'completed',
          });

          const previewExport = await dependencies.createExportJob(projectId, userId, 'pdf', { priority: 20 });
          if (!previewExport) {
            throw new Error('Failed to create preview export job for image-aware critic pass.');
          }

          const completedExport = await waitForExportCompletion(previewExport.id);
          const criticReportArtifact = await dependencies.createCriticReportArtifact({
            runId,
            projectId,
            cycle,
            stage: 'critic_image_pass',
            exportReview: completedExport.reviewJson as Record<string, unknown> | null,
          });
          const criticReport = criticReportArtifact.jsonContent as Record<string, unknown>;
          const routedRewriteCounts = (criticReport.routedRewriteCounts ?? {
            writer: 0,
            dndExpert: 0,
            layoutExpert: 0,
            artist: 0,
          }) as GenerationGraphData['routedRewriteCounts'];

          await dependencies.updateRunGraphState(runId, userId, {
            latestPreviewExportJobId: previewExport.id,
            latestPreviewExportReview: completedExport.reviewJson,
            latestCriticReportId: criticReportArtifact.id,
            routedRewriteCounts,
            criticCycle: cycle,
          });

          if (criticReport.passed === true) {
            return {
              nextNode: 'final_editor',
              data: {
                ...data,
                criticCycle: cycle,
                latestCriticReportId: criticReportArtifact.id,
                latestPreviewExportJobId: previewExport.id,
                latestPreviewExportReview: completedExport.reviewJson as Record<string, unknown> | null,
                routedRewriteCounts,
              },
            };
          }

          if (cycle >= MAX_CRITIC_CYCLES) {
            if ((criticReport.blockingFindingCount as number ?? 0) === 0 && (criticReport.overallScore as number ?? 0) >= 75) {
              return {
                nextNode: 'final_editor',
                data: {
                  ...data,
                  criticCycle: cycle,
                  latestCriticReportId: criticReportArtifact.id,
                  latestPreviewExportJobId: previewExport.id,
                  latestPreviewExportReview: completedExport.reviewJson as Record<string, unknown> | null,
                  routedRewriteCounts,
                },
              };
            }

            throw new Error('Image-aware critic loop exhausted before the draft reached printable quality.');
          }

          const owner = selectRewriteOwner(routedRewriteCounts);
          return {
            nextNode:
              owner === 'artist' ? 'artist_requested'
                : owner === 'dndExpert' ? 'rewrite_dnd_expert'
                  : 'rewrite_layout',
            data: {
              ...data,
              criticCycle: cycle,
              latestCriticReportId: criticReportArtifact.id,
              latestPreviewExportJobId: previewExport.id,
              latestPreviewExportReview: completedExport.reviewJson as Record<string, unknown> | null,
              routedRewriteCounts,
            },
          };
        })()),

        final_editor: async ({ data }) => withCoreStageTimeout('Final editor node', (async () => {
          await setAgentStage('final_editor', 'evaluating', 92, {
            finalEditorialStatus: 'pending',
          });

          const criticArtifact = data.latestCriticReportId
            ? await prisma.generatedArtifact.findUnique({ where: { id: data.latestCriticReportId } })
            : null;
          const { model, maxOutputTokens } = await resolveModelForAgent('agent.final_editor');
          const review = await dependencies.executeFinalEditorReview(
            {
              id: runId,
              projectId,
              title: interviewBrief?.title ?? fullRun.inputPrompt,
            },
            criticArtifact?.jsonContent ?? null,
            data.latestPreviewExportReview ?? null,
            model,
            maxOutputTokens,
          );

          await dependencies.updateRunGraphState(runId, userId, {
            finalEditorialStatus: review.decision.approved ? 'approved' : review.decision.targetedRewriteOwner ? 'rewrite_requested' : 'failed',
          });

          if (review.decision.approved) {
            return {
              nextNode: 'printer',
              data: {
                ...data,
                finalEditorialStatus: 'approved',
                latestEditorReportId: review.artifactId,
              },
            };
          }

          if (review.decision.targetedRewriteOwner && !data.finalEditorRewriteUsed) {
            return {
              nextNode:
                review.decision.targetedRewriteOwner === 'writer' ? 'rewrite_writer'
                  : review.decision.targetedRewriteOwner === 'dnd_expert' ? 'rewrite_dnd_expert'
                    : review.decision.targetedRewriteOwner === 'artist' ? 'artist_requested'
                      : 'rewrite_layout',
              data: {
                ...data,
                finalEditorRewriteUsed: true,
                latestEditorReportId: review.artifactId,
              },
            };
          }

          throw new Error(`Final editor rejected the draft: ${review.decision.summary}`);
        })()),

        printer: async ({ data }) => withCoreStageTimeout('Printer node', (async () => {
          await setAgentStage('printer', 'assembling', 96);
          const latestManifest = await prisma.assemblyManifest.findFirst({
            where: { runId, projectId },
            orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
            select: { id: true },
          });
          await dependencies.createPrintManifestArtifact({
            runId,
            projectId,
            sourceManifestId: latestManifest?.id ?? null,
            latestCriticReportId: data.latestCriticReportId ?? null,
            editorReportId: (data as Record<string, unknown>).latestEditorReportId as string | null ?? null,
          });

          const finalExport = await dependencies.createExportJob(projectId, userId, 'print_pdf', { priority: 25 });
          if (!finalExport) {
            throw new Error('Failed to create final print export.');
          }
          await waitForExportCompletion(finalExport.id);
          await publishProgress('assembling', 99);
          return { nextNode: null };
        })()),
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
