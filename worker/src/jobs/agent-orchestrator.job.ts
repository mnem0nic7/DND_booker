import type { Job } from 'bullmq';
import type {
  AgentRun,
  AgentRunStatus,
  AgentScorecard,
  CritiqueBacklogItem,
  DesignProfile,
} from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import {
  runPersistedGraph,
  type PersistedGraphSnapshot,
} from '../graph/persisted-graph.js';

export interface AgentJobData {
  agentRunId: string;
  userId: string;
  projectId: string;
}

interface AgentGraphData extends Record<string, unknown> {
  cycleIndex: number | null;
  reviewExportJobId: string | null;
  observeActionId: string | null;
  plannedAction: Record<string, unknown> | null;
  mutationActionId: string | null;
  projectChangedSinceLastExport: boolean;
  stopReason: string | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasRetryRemaining(job: Job<AgentJobData>) {
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
  return job.attemptsMade + 1 < attempts;
}

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

function formatPlannedActionLabel(actionType: string) {
  return actionType.replace(/_/g, ' ');
}

function readRuntimeState(graphStateJson: unknown) {
  if (!isRecord(graphStateJson)) return null;
  return graphStateJson.runtime ?? null;
}

function buildRuntimePatch(
  snapshot: PersistedGraphSnapshot<AgentGraphData>,
  graphCheckpointKey: string | null,
) {
  const resumeToken = `${graphCheckpointKey ?? 'agent'}:${snapshot.currentNode ?? 'completed'}:${snapshot.stepCount}`;
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

async function loadAgentDependencies() {
  const runService = await import('../../../server/src/services/agent/run.service.js');
  const pubsubService = await import('../../../server/src/services/agent/pubsub.service.js');
  const checkpointService = await import('../../../server/src/services/agent/checkpoint.service.js');
  const logService = await import('../../../server/src/services/agent/log.service.js');
  const plannerService = await import('../../../server/src/services/agent/action-planner.service.js');
  const designProfileService = await import('../../../server/src/services/agent/design-profile.service.js');
  const scorecardService = await import('../../../server/src/services/agent/scorecard.service.js');
  const layoutAuditService = await import('../../../server/src/services/agent/layout-parity-auditor.service.js');
  const layoutRefreshService = await import('../../../server/src/services/agent/layout-refresh.service.js');
  const randomTableService = await import('../../../server/src/services/agent/random-table-expander.service.js');
  const statBlockService = await import('../../../server/src/services/agent/stat-block-repair.service.js');
  const utilityService = await import('../../../server/src/services/agent/utility-densifier.service.js');
  const artifactService = await import('../../../server/src/services/agent/artifact.service.js');
  const generationRunService = await import('../../../server/src/services/generation/run.service.js');
  const generationQueueService = await import('../../../server/src/services/generation/queue.service.js');
  const exportService = await import('../../../server/src/services/export.service.js');
  const interruptService = await import('../../../server/src/services/graph/interrupt.service.js');

  return {
    ...runService,
    ...pubsubService,
    ...checkpointService,
    ...logService,
    ...plannerService,
    ...designProfileService,
    ...scorecardService,
    ...layoutAuditService,
    ...layoutRefreshService,
    ...randomTableService,
    ...statBlockService,
    ...utilityService,
    ...artifactService,
    createGenerationRun: generationRunService.createRun,
    enqueueGenerationRun: generationQueueService.enqueueGenerationRun,
    ...exportService,
    ...interruptService,
  };
}

async function waitForGenerationRunCompletion(runId: string) {
  const timeoutAt = Date.now() + 45 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const run = await prisma.generationRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        currentStage: true,
        failureReason: true,
      },
    });
    if (!run) throw new Error('Seed generation run not found.');
    if (run.status === 'completed') return run;
    if (run.status === 'failed' || run.status === 'cancelled') {
      throw new Error(run.failureReason ?? `Seed generation ${run.status}.`);
    }
    await sleep(3000);
  }

  throw new Error('Timed out waiting for seed generation to complete.');
}

async function waitForExportCompletion(exportJobId: string) {
  const timeoutAt = Date.now() + 15 * 60 * 1000;

  while (Date.now() < timeoutAt) {
    const exportJob = await prisma.exportJob.findUnique({
      where: { id: exportJobId },
      select: {
        id: true,
        status: true,
        errorMessage: true,
        reviewJson: true,
        projectId: true,
        userId: true,
        format: true,
      },
    });
    if (!exportJob) throw new Error('Export job not found.');
    if (exportJob.status === 'completed') return exportJob;
    if (exportJob.status === 'failed') {
      throw new Error(exportJob.errorMessage ?? 'Export failed.');
    }
    await sleep(2000);
  }

  throw new Error('Timed out waiting for export review.');
}

function progressForCycle(cycleIndex: number, maxCycles: number, phaseOffset: number) {
  const cycleBase = maxCycles <= 0 ? 0 : ((cycleIndex - 1) / Math.max(1, maxCycles)) * 70;
  return Math.max(1, Math.min(99, Math.round(12 + cycleBase + phaseOffset)));
}

async function loadAgentControlState(agentRunId: string) {
  const run = await prisma.agentRun.findUnique({
    where: { id: agentRunId },
    select: { status: true },
  });
  if (!run) throw new Error('Agent run no longer exists.');
  if (run.status === 'cancelled') return 'cancelled' as const;
  if (run.status === 'paused') return 'paused' as const;
  return 'active' as const;
}

export async function processAgentRun(job: Job<AgentJobData>): Promise<void> {
  const { agentRunId, userId, projectId } = job.data;
  const dependencies = await loadAgentDependencies();
  const initialRun = await dependencies.getAgentRun(agentRunId, userId);

  if (!initialRun) {
    throw new Error('Agent run not found.');
  }

  async function refreshRun() {
    const run = await dependencies.getAgentRun(agentRunId, userId);
    if (!run) throw new Error('Agent run not found.');
    return run;
  }

  async function setStatus(status: AgentRunStatus, progressPercent: number) {
    const current = await refreshRun();
    if (current.status !== status) {
      await dependencies.transitionAgentRunStatus(agentRunId, userId, status);
    }
    const updated = await dependencies.updateAgentRunProgress(agentRunId, userId, status, progressPercent);
    await dependencies.publishAgentEvent(agentRunId, {
      type: 'run_status',
      runId: agentRunId,
      status: updated?.status ?? status,
      stage: updated?.currentStage ?? status,
      progressPercent: updated?.progressPercent ?? progressPercent,
    });
  }

  async function checkpointAndPublish(input: {
    label: string;
    summary?: string | null;
    cycleIndex: number;
    scorecard?: AgentScorecard | null;
    isBest?: boolean;
  }) {
    const checkpoint = await dependencies.createAgentCheckpoint({
      runId: agentRunId,
      projectId,
      label: input.label,
      summary: input.summary ?? null,
      cycleIndex: input.cycleIndex,
      scorecard: input.scorecard ?? null,
      isBest: input.isBest ?? false,
    });

    await dependencies.updateAgentRunState({
      runId: agentRunId,
      latestCheckpointId: checkpoint.id,
      ...(input.isBest ? { bestCheckpointId: checkpoint.id } : {}),
    });

    await dependencies.updateAgentRunGraphState({
      runId: agentRunId,
      userId,
      patch: {
        latestCheckpointId: checkpoint.id,
        ...(input.isBest ? { bestCheckpointId: checkpoint.id } : {}),
        lastCheckpointLabel: checkpoint.label,
        cycleIndex: input.cycleIndex,
      },
    });

    await dependencies.publishAgentEvent(agentRunId, {
      type: 'checkpoint_created',
      runId: agentRunId,
      checkpointId: checkpoint.id,
      label: checkpoint.label,
      isBest: checkpoint.isBest,
    });

    return checkpoint;
  }

  async function ensureActionStarted(actionId: string) {
    const action = await prisma.agentAction.findUnique({
      where: { id: actionId },
      select: { status: true },
    });
    if (!action) return;
    if (action.status === 'queued') {
      await dependencies.startAgentAction(actionId);
    }
  }

  async function completeActionIfPending(actionId: string, result: Record<string, unknown>) {
    const action = await prisma.agentAction.findUnique({
      where: { id: actionId },
      select: { status: true },
    });
    if (!action || action.status === 'completed') return;
    await dependencies.completeAgentAction({
      actionId,
      result,
    });
  }

  async function loadBestScorecard(run: AgentRun) {
    if (!run.bestCheckpointId) return null;
    const checkpoint = await prisma.agentCheckpoint.findUnique({
      where: { id: run.bestCheckpointId },
      select: { scorecardJson: true },
    });
    return (checkpoint?.scorecardJson as AgentScorecard | null) ?? null;
  }

  try {
    await dependencies.updateAgentRunGraphState({
      runId: agentRunId,
      userId,
      patch: {
        jobName: job.name,
        attemptsMade: job.attemptsMade,
        queueName: 'agent',
        resumedFromCheckpoint: Boolean(readRuntimeState(initialRun.graphStateJson)),
      },
    });

    const graphResult = await runPersistedGraph<AgentGraphData, undefined>({
      startNode: 'seed_generation',
      initialData: {
        cycleIndex: null,
        reviewExportJobId: null,
        observeActionId: null,
        plannedAction: null,
        mutationActionId: null,
        projectChangedSinceLastExport: false,
        stopReason: null,
      },
      loadSnapshot: () => readRuntimeState(initialRun.graphStateJson),
      externalContext: undefined,
      checkControl: async () => loadAgentControlState(agentRunId),
      pauseBehavior: 'wait',
      persistSnapshot: async (snapshot) => {
        await dependencies.updateAgentRunGraphState({
          runId: agentRunId,
          userId,
          patch: buildRuntimePatch(
            snapshot,
            initialRun.graphCheckpointKey ?? null,
          ),
        });
      },
      nodes: {
        seed_generation: async () => {
          const currentRun = await refreshRun();
          if (currentRun.mode !== 'background_producer') {
            return { nextNode: 'ensure_design_profile' };
          }

          if (currentRun.linkedGenerationRunId) {
            await waitForGenerationRunCompletion(currentRun.linkedGenerationRunId);
            return { nextNode: 'ensure_design_profile' };
          }

          await setStatus('seeding', 4);

          const action = await dependencies.createAgentAction({
            runId: agentRunId,
            cycleIndex: 0,
            actionType: 'seed_generation',
            rationale: 'Create the first deterministic draft before entering the autonomous improvement loop.',
            input: currentRun.goal,
          });
          await dependencies.startAgentAction(action.id);
          await dependencies.publishAgentEvent(agentRunId, {
            type: 'action_started',
            runId: agentRunId,
            actionId: action.id,
            actionType: action.actionType,
            cycleIndex: 0,
          });

          const seedRun = await dependencies.createGenerationRun({
            projectId,
            userId,
            prompt: currentRun.goal.prompt ?? currentRun.goal.objective,
            mode: currentRun.goal.generationMode,
            quality: currentRun.goal.generationQuality,
            pageTarget: currentRun.goal.pageTarget ?? undefined,
          });
          if (!seedRun) throw new Error('Failed to create seed generation run.');

          await dependencies.updateAgentRunState({
            runId: agentRunId,
            linkedGenerationRunId: seedRun.id,
          });
          await dependencies.enqueueGenerationRun(seedRun.id, userId, projectId, { priority: 10 });
          await waitForGenerationRunCompletion(seedRun.id);

          await dependencies.completeAgentAction({
            actionId: action.id,
            result: { generationRunId: seedRun.id },
          });
          await dependencies.publishAgentEvent(agentRunId, {
            type: 'action_completed',
            runId: agentRunId,
            actionId: action.id,
            actionType: action.actionType,
            cycleIndex: 0,
            summary: 'Seed generation completed.',
          });

          return { nextNode: 'ensure_design_profile' };
        },

        ensure_design_profile: async () => {
          await setStatus('observing', 8);
          const currentRun = await refreshRun();
          if (currentRun.designProfile) {
            return { nextNode: 'ensure_initial_checkpoint' };
          }

          const project = await prisma.project.findUniqueOrThrow({
            where: { id: projectId },
            select: { title: true },
          });
          const designProfile = dependencies.buildDefaultDesignProfile(project.title) as DesignProfile;
          await dependencies.updateAgentRunState({
            runId: agentRunId,
            designProfile,
            currentStrategy: 'Establishing the DM-ready house style and critique baseline.',
          });
          await dependencies.createAgentObservation({
            runId: agentRunId,
            cycleIndex: 0,
            observationType: 'design_profile',
            summary: `Established design profile "${designProfile.title}".`,
            payload: designProfile,
          });
          await dependencies.createAgentGeneratedArtifactIfPossible({
            agentRunId,
            projectId,
            artifactType: 'design_profile',
            artifactKey: `agent-design-profile-${agentRunId}`,
            title: designProfile.title,
            summary: designProfile.summary,
            jsonContent: designProfile,
            markdownContent: [
              `# ${designProfile.title}`,
              '',
              designProfile.summary,
              '',
              '## Constraints',
              ...designProfile.constraints.map((constraint: { code: string; description: string }) => `- **${constraint.code}**: ${constraint.description}`),
            ].join('\n'),
          });
          await dependencies.publishAgentEvent(agentRunId, {
            type: 'design_profile_created',
            runId: agentRunId,
            title: designProfile.title,
          });

          return { nextNode: 'ensure_initial_checkpoint' };
        },

        ensure_initial_checkpoint: async () => {
          const currentRun = await refreshRun();
          if (currentRun.latestCheckpointId && currentRun.bestCheckpointId) {
            return { nextNode: 'cycle_budget_gate' };
          }

          const existing = await prisma.agentCheckpoint.findFirst({
            where: { runId: agentRunId, cycleIndex: 0 },
            orderBy: { createdAt: 'asc' },
          });

          if (existing) {
            await dependencies.updateAgentRunState({
              runId: agentRunId,
              latestCheckpointId: existing.id,
              bestCheckpointId: currentRun.bestCheckpointId ?? existing.id,
            });
            return { nextNode: 'cycle_budget_gate' };
          }

          const checkpoint = await checkpointAndPublish({
            label: 'Initial project snapshot',
            summary: 'Baseline reversible snapshot before autonomous mutations.',
            cycleIndex: 0,
            isBest: true,
          });
          await dependencies.updateAgentRunState({
            runId: agentRunId,
            bestCheckpointId: checkpoint.id,
            latestCheckpointId: checkpoint.id,
          });

          return { nextNode: 'cycle_budget_gate' };
        },

        cycle_budget_gate: async () => {
          const currentRun = await refreshRun();
          const budgetStopReason = dependencies.shouldStopForBudget({
            budget: currentRun.budget,
            cycleCount: currentRun.cycleCount,
            exportCount: currentRun.exportCount,
            noImprovementStreak: currentRun.noImprovementStreak,
            startedAt: currentRun.startedAt ? Date.parse(currentRun.startedAt) : Date.parse(currentRun.createdAt),
          });

          if (budgetStopReason) {
            await dependencies.createAgentDecision({
              runId: agentRunId,
              cycleIndex: currentRun.cycleCount,
              decisionType: 'stop',
              rationale: budgetStopReason,
            });
            await dependencies.publishAgentEvent(agentRunId, {
              type: 'decision_made',
              runId: agentRunId,
              cycleIndex: currentRun.cycleCount,
              actionType: null,
              rationale: budgetStopReason,
            });
            return {
              nextNode: 'finalize_best_checkpoint',
              data: {
                stopReason: budgetStopReason,
                cycleIndex: currentRun.cycleCount,
              },
            };
          }

          return {
            nextNode: 'observe_export',
            data: {
              cycleIndex: currentRun.cycleCount + 1,
              stopReason: null,
            },
          };
        },

        observe_export: async ({ data, persistData }) => {
          const currentRun = await refreshRun();
          const cycleIndex = data.cycleIndex ?? (currentRun.cycleCount + 1);
          await setStatus('observing', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 0));

          let reviewExportJobId = data.reviewExportJobId;
          let observeActionId = data.observeActionId;

          if (!observeActionId) {
            const action = await dependencies.createAgentAction({
              runId: agentRunId,
              cycleIndex,
              actionType: 'create_export_review',
              rationale: 'Export the current project state to gather real layout and DM-usability findings.',
            });
            await dependencies.startAgentAction(action.id);
            await dependencies.publishAgentEvent(agentRunId, {
              type: 'action_started',
              runId: agentRunId,
              actionId: action.id,
              actionType: action.actionType,
              cycleIndex,
            });
            observeActionId = action.id;
          }

          if (!reviewExportJobId) {
            const exportJob = await dependencies.createExportJob(projectId, userId, 'pdf');
            if (!exportJob) throw new Error('Failed to create export job for agent review.');

            await dependencies.updateAgentRunState({
              runId: agentRunId,
              exportCount: currentRun.exportCount + 1,
            });

            reviewExportJobId = exportJob.id;
            await persistData({
              cycleIndex,
              reviewExportJobId,
              observeActionId,
            });
          }

          await waitForExportCompletion(reviewExportJobId);

          if (observeActionId) {
            await completeActionIfPending(observeActionId, { exportJobId: reviewExportJobId });
            await dependencies.publishAgentEvent(agentRunId, {
              type: 'action_completed',
              runId: agentRunId,
              actionId: observeActionId,
              actionType: 'create_export_review',
              cycleIndex,
              summary: 'Captured export review.',
            });
          }

          return {
            nextNode: 'evaluate_review',
            data: {
              cycleIndex,
              reviewExportJobId,
              observeActionId,
            },
          };
        },

        evaluate_review: async ({ data }) => {
          const currentRun = await refreshRun();
          const cycleIndex = data.cycleIndex ?? (currentRun.cycleCount + 1);
          const reviewExportJobId = data.reviewExportJobId;
          if (!reviewExportJobId) {
            throw new Error('Missing export review job for evaluation.');
          }

          await setStatus('evaluating', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 8));

          const completedExport = await waitForExportCompletion(reviewExportJobId);
          const review = completedExport.reviewJson as any;
          if (!review) {
            throw new Error('Agent review export completed without review data.');
          }

          const { scorecard, backlog } = dependencies.buildScorecardFromExportReview(completedExport.id, review) as {
            scorecard: AgentScorecard;
            backlog: CritiqueBacklogItem[];
          };

          await dependencies.createAgentObservation({
            runId: agentRunId,
            cycleIndex,
            observationType: 'export_review',
            summary: review.summary,
            payload: review,
          });
          await dependencies.createAgentObservation({
            runId: agentRunId,
            cycleIndex,
            observationType: 'scorecard',
            summary: `Scored ${scorecard.overallScore}/100 with ${scorecard.blockingFindingCount} blocking and ${scorecard.warningFindingCount} warning findings.`,
            payload: scorecard,
          });
          await dependencies.createAgentObservation({
            runId: agentRunId,
            cycleIndex,
            observationType: 'backlog',
            summary: `Built a critique backlog with ${backlog.length} actionable findings.`,
            payload: backlog,
          });

          const bestScorecard = await loadBestScorecard(currentRun);
          const improved = dependencies.isMeaningfulImprovement(bestScorecard, scorecard);
          const reviewCheckpoint = await checkpointAndPublish({
            label: `Cycle ${cycleIndex} review`,
            summary: review.summary,
            cycleIndex,
            scorecard,
            isBest: improved,
          });

          let noImprovementStreak = improved ? 0 : currentRun.noImprovementStreak + 1;
          let bestCheckpointId = currentRun.bestCheckpointId;
          if (improved) {
            bestCheckpointId = reviewCheckpoint.id;
            await dependencies.markBestCheckpoint(agentRunId, reviewCheckpoint.id);
          }

          await dependencies.updateAgentRunState({
            runId: agentRunId,
            latestScorecard: scorecard,
            critiqueBacklog: backlog,
            bestCheckpointId,
            latestCheckpointId: reviewCheckpoint.id,
            cycleCount: cycleIndex,
            exportCount: currentRun.exportCount,
            noImprovementStreak,
          });
          await dependencies.publishAgentEvent(agentRunId, {
            type: 'score_updated',
            runId: agentRunId,
            scorecard,
          });

          if (dependencies.isTargetQuality(scorecard)) {
            const rationale = 'The latest scorecard meets the DM-ready quality threshold and no blocking review findings remain.';
            await dependencies.createAgentDecision({
              runId: agentRunId,
              cycleIndex,
              decisionType: 'stop',
              rationale,
            });
            await dependencies.publishAgentEvent(agentRunId, {
              type: 'decision_made',
              runId: agentRunId,
              cycleIndex,
              actionType: null,
              rationale,
            });

            return {
              nextNode: 'finalize_best_checkpoint',
              data: {
                cycleIndex,
                reviewExportJobId: null,
                observeActionId: null,
                stopReason: rationale,
                projectChangedSinceLastExport: false,
              },
            };
          }

          return {
            nextNode: 'plan_action',
            data: {
              cycleIndex,
            },
          };
        },

        plan_action: async ({ data }) => {
          const currentRun = await refreshRun();
          const cycleIndex = data.cycleIndex ?? currentRun.cycleCount;
          await setStatus('planning', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 14));

          const plan = dependencies.chooseNextAgentAction({
            backlog: currentRun.critiqueBacklog,
            scorecard: currentRun.latestScorecard as AgentScorecard,
            designProfile: currentRun.designProfile as DesignProfile,
            budget: currentRun.budget,
            cycleCount: currentRun.cycleCount,
            exportCount: currentRun.exportCount,
          }) as any;

          await dependencies.updateAgentRunState({
            runId: agentRunId,
            currentStrategy: String(plan.rationale ?? ''),
          });
          await dependencies.createAgentDecision({
            runId: agentRunId,
            cycleIndex,
            decisionType: plan.actionType === 'no_op' ? 'stop' : 'cycle_plan',
            chosenActionType: (plan.actionType as any) ?? null,
            rationale: String(plan.rationale ?? ''),
            payload: plan,
          });
          await dependencies.publishAgentEvent(agentRunId, {
            type: 'decision_made',
            runId: agentRunId,
            cycleIndex,
            actionType: (plan.actionType as any) ?? null,
            rationale: String(plan.rationale ?? ''),
          });

          if (plan.actionType === 'no_op') {
            return {
              nextNode: 'finalize_best_checkpoint',
              data: {
                cycleIndex,
                stopReason: String(plan.rationale ?? ''),
                plannedAction: null,
              },
            };
          }

          return {
            nextNode: currentRun.mode === 'persistent_editor' ? 'approval_gate' : 'apply_action',
            data: {
              cycleIndex,
              plannedAction: plan,
              mutationActionId: null,
            },
          };
        },

        approval_gate: async ({ data }) => {
          const currentRun = await refreshRun();
          const cycleIndex = data.cycleIndex ?? currentRun.cycleCount;
          const plan = data.plannedAction;
          if (!plan) {
            throw new Error('Missing planned action for approval gate.');
          }

          if (currentRun.mode !== 'persistent_editor') {
            return { nextNode: 'apply_action' };
          }

          await setStatus('planning', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 18));

          const interruptKey = [
            'agent-action-review',
            cycleIndex,
            data.reviewExportJobId ?? 'none',
            String(plan.actionType ?? 'no_op'),
            String(plan.targetTitle ?? 'project'),
          ].join(':');

          const interruptResult = await dependencies.ensureAgentRunInterrupt({
            runId: agentRunId,
            userId,
            interruptKey,
            kind: 'approval_gate',
            title: 'Approve planned creative-director action',
            summary: `Approve the next planned mutation: ${formatPlannedActionLabel(String(plan.actionType ?? 'no_op'))}. ${String(plan.rationale ?? '')}`.trim(),
            payload: {
              cycleIndex,
              actionType: plan.actionType,
              targetTitle: plan.targetTitle ?? null,
              reviewExportJobId: data.reviewExportJobId ?? null,
            },
          });

          if (!interruptResult) {
            throw new Error('Failed to persist agent approval gate.');
          }

          if (interruptResult.interrupt.status === 'pending') {
            const pausedRun = await dependencies.transitionAgentRunStatus(agentRunId, userId, 'paused');

            if (interruptResult.created) {
              await dependencies.publishAgentEvent(agentRunId, {
                type: 'run_warning',
                runId: agentRunId,
                message: 'Awaiting approval before the creative director applies the next mutation.',
                severity: 'info',
              });
            }

            await dependencies.publishAgentEvent(agentRunId, {
              type: 'run_status',
              runId: agentRunId,
              status: pausedRun?.status ?? 'paused',
              stage: pausedRun?.currentStage ?? 'planning',
              progressPercent: pausedRun?.progressPercent ?? progressForCycle(cycleIndex, currentRun.budget.maxCycles, 18),
            });

            return { nextNode: 'approval_gate' };
          }

          if (interruptResult.interrupt.status === 'rejected') {
            return {
              nextNode: null,
              data: {
                stopReason: 'Creative director action was rejected by the reviewer.',
              },
            };
          }

          if (interruptResult.interrupt.status === 'edited') {
            const note = readResolutionNote(interruptResult.interrupt.resolutionPayload);
            if (note) {
              await dependencies.publishAgentEvent(agentRunId, {
                type: 'run_warning',
                runId: agentRunId,
                message: `Reviewer requested edits before the next mutation: ${note}`,
                severity: 'info',
              });
            }

            return {
              nextNode: 'observe_export',
              data: {
                cycleIndex,
                reviewExportJobId: null,
                observeActionId: null,
                plannedAction: null,
                mutationActionId: null,
                projectChangedSinceLastExport: true,
              },
            };
          }

          return { nextNode: 'apply_action' };
        },

        apply_action: async ({ data, persistData }) => {
          const currentRun = await refreshRun();
          const cycleIndex = data.cycleIndex ?? currentRun.cycleCount;
          const plan = data.plannedAction;
          if (!plan) {
            throw new Error('Missing planned action payload.');
          }

          await setStatus('acting', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 22));

          let mutationActionId = data.mutationActionId;
          if (!mutationActionId) {
            const action = await dependencies.createAgentAction({
              runId: agentRunId,
              cycleIndex,
              actionType: plan.actionType as any,
              rationale: String(plan.rationale ?? ''),
              input: plan,
            });
            mutationActionId = action.id;
            await persistData({ mutationActionId });
          }

          await ensureActionStarted(mutationActionId);
          await dependencies.publishAgentEvent(agentRunId, {
            type: 'action_started',
            runId: agentRunId,
            actionId: mutationActionId,
            actionType: plan.actionType as any,
            cycleIndex,
          });

          const targetedBacklog = plan.targetTitle
            ? currentRun.critiqueBacklog.filter((item) => item.targetTitle === plan.targetTitle)
            : currentRun.critiqueBacklog;

          let actionResult: Record<string, unknown>;
          switch (plan.actionType) {
            case 'audit_layout_parity':
              actionResult = await dependencies.auditLayoutParityFromReview({
                exportJobId: String(data.reviewExportJobId),
                projectId,
                userId,
                targetTitle: (plan.targetTitle as string | undefined) ?? undefined,
              });
              break;
            case 'refresh_layout_plan':
              {
                const completedExport = await waitForExportCompletion(String(data.reviewExportJobId));
                actionResult = await dependencies.refreshLayoutPlansFromReview({
                  projectId,
                  review: completedExport.reviewJson as any,
                  targetTitle: (plan.targetTitle as string | undefined) ?? undefined,
                });
              }
              break;
            case 'expand_random_tables':
              actionResult = await dependencies.expandRandomTablesFromBacklog({
                projectId,
                userId,
                backlog: targetedBacklog.filter((item) => item.code === 'EXPORT_THIN_RANDOM_TABLE'),
              });
              break;
            case 'repair_stat_blocks':
              actionResult = await dependencies.repairStatBlocksFromBacklog({
                projectId,
                userId,
                backlog: targetedBacklog.filter((item) =>
                  item.code === 'EXPORT_PLACEHOLDER_STAT_BLOCK' || item.code === 'EXPORT_SUSPICIOUS_STAT_BLOCK',
                ),
              });
              break;
            case 'densify_section_utility':
              actionResult = await dependencies.densifySectionUtilityFromBacklog({
                projectId,
                userId,
                backlog: targetedBacklog.filter((item) => item.code === 'EXPORT_LOW_UTILITY_DENSITY'),
              });
              break;
            default:
              actionResult = {};
              break;
          }

          await completeActionIfPending(mutationActionId, actionResult);
          await dependencies.publishAgentEvent(agentRunId, {
            type: 'action_completed',
            runId: agentRunId,
            actionId: mutationActionId,
            actionType: plan.actionType as any,
            cycleIndex,
            summary: typeof actionResult.documentsUpdated === 'number'
              ? `Updated ${actionResult.documentsUpdated} document(s).`
              : 'Applied autonomous mutation.',
          });

          return {
            nextNode: 'mutation_checkpoint',
            data: {
              cycleIndex,
              projectChangedSinceLastExport: true,
            },
          };
        },

        mutation_checkpoint: async ({ data }) => {
          const currentRun = await refreshRun();
          const cycleIndex = data.cycleIndex ?? currentRun.cycleCount;
          await setStatus('checkpointing', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 28));
          await checkpointAndPublish({
            label: `Cycle ${cycleIndex} mutation`,
            summary: currentRun.currentStrategy,
            cycleIndex,
          });

          return {
            nextNode: 'cycle_budget_gate',
            data: {
              cycleIndex: null,
              reviewExportJobId: null,
              observeActionId: null,
              plannedAction: null,
              mutationActionId: null,
            },
          };
        },

        finalize_best_checkpoint: async ({ data }) => {
          const currentRun = await refreshRun();
          if (currentRun.bestCheckpointId && currentRun.latestCheckpointId !== currentRun.bestCheckpointId) {
            const restored = await dependencies.restoreAgentCheckpoint(agentRunId, currentRun.bestCheckpointId, userId);
            if (restored) {
              await dependencies.updateAgentRunState({
                runId: agentRunId,
                latestCheckpointId: restored.id,
                bestCheckpointId: restored.id,
              });
              await dependencies.publishAgentEvent(agentRunId, {
                type: 'checkpoint_restored',
                runId: agentRunId,
                checkpointId: restored.id,
                label: restored.label,
              });
              return {
                nextNode: 'final_export',
                data: {
                  projectChangedSinceLastExport: true,
                  stopReason: data.stopReason,
                },
              };
            }
          }

          return {
            nextNode: 'final_export',
            data: {
              stopReason: data.stopReason,
            },
          };
        },

        final_export: async ({ data }) => {
          const currentRun = await refreshRun();
          if (data.projectChangedSinceLastExport && currentRun.exportCount < currentRun.budget.maxExports) {
            await setStatus('observing', 96);
            const finalExport = await dependencies.createExportJob(projectId, userId, 'pdf');
            if (finalExport) {
              await dependencies.updateAgentRunState({
                runId: agentRunId,
                exportCount: currentRun.exportCount + 1,
              });
              await waitForExportCompletion(finalExport.id);
            }
          }

          return { nextNode: 'write_report' };
        },

        write_report: async () => {
          const finalRun = await refreshRun();
          const report = {
            goal: finalRun.goal,
            budget: finalRun.budget,
            cycleCount: finalRun.cycleCount,
            exportCount: finalRun.exportCount,
            latestScorecard: finalRun.latestScorecard,
            bestCheckpointId: finalRun.bestCheckpointId,
            critiqueBacklog: finalRun.critiqueBacklog,
          };

          await dependencies.createAgentGeneratedArtifactIfPossible({
            agentRunId,
            projectId,
            artifactType: 'agent_run_report',
            artifactKey: `agent-run-report-${agentRunId}`,
            title: 'Autonomous Creative Director Report',
            summary: finalRun.latestScorecard?.summary ?? 'Autonomous improvement run completed.',
            jsonContent: report,
            markdownContent: [
              '# Autonomous Creative Director Report',
              '',
              `- Cycles: ${finalRun.cycleCount}`,
              `- Exports: ${finalRun.exportCount}`,
              `- Best checkpoint: ${finalRun.bestCheckpointId ?? 'none'}`,
              finalRun.latestScorecard ? `- Latest score: ${finalRun.latestScorecard.overallScore}` : '- Latest score: unavailable',
            ].join('\n'),
          });

          return { nextNode: null };
        },
      },
    });

    if (graphResult.outcome === 'cancelled') {
      await dependencies.publishAgentEvent(agentRunId, {
        type: 'run_warning',
        runId: agentRunId,
        message: 'Agent run cancelled.',
        severity: 'warning',
      });
      return;
    }

    await dependencies.transitionAgentRunStatus(agentRunId, userId, 'completed');
    await dependencies.updateAgentRunProgress(agentRunId, userId, null, 100);
    await dependencies.publishAgentEvent(agentRunId, {
      type: 'run_completed',
      runId: agentRunId,
      bestCheckpointId: (await refreshRun()).bestCheckpointId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const willRetry = hasRetryRemaining(job);

    try {
      await dependencies.updateAgentRunGraphState({
        runId: agentRunId,
        userId,
        patch: {
          lastError: reason,
          lastErrorAt: new Date().toISOString(),
          retryPending: willRetry,
          attemptsMade: job.attemptsMade,
        },
      });

      if (willRetry) {
        await dependencies.publishAgentEvent(agentRunId, {
          type: 'run_warning',
          runId: agentRunId,
          message: `Agent worker attempt ${job.attemptsMade + 1} failed and will retry: ${reason}`,
          severity: 'warning',
        });
      } else {
        await dependencies.transitionAgentRunStatus(agentRunId, userId, 'failed', reason);
        await dependencies.publishAgentEvent(agentRunId, {
          type: 'run_failed',
          runId: agentRunId,
          reason,
        });
      }
    } catch (publishError) {
      console.error('[agent] Failed to persist retry/failure state:', publishError);
    }

    throw error;
  }
}
