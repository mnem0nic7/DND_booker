import type { Job } from 'bullmq';
import { prisma } from '../config/database.js';

export interface AgentJobData {
  agentRunId: string;
  userId: string;
  projectId: string;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForAgentRunnable(runId: string) {
  // Pause is cooperative. The worker keeps ownership of the run and waits until it is resumed or cancelled.
  // This keeps the orchestration logic simple for the first vertical slice.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const run = await prisma.agentRun.findUnique({
      where: { id: runId },
      select: { status: true },
    });
    if (!run) throw new Error('Agent run no longer exists.');
    if (run.status === 'cancelled') return 'cancelled';
    if (run.status !== 'paused') return 'active';
    await sleep(2000);
  }
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

export async function processAgentRun(job: Job<AgentJobData>): Promise<void> {
  const { agentRunId, userId, projectId } = job.data;

  const {
    getAgentRun,
    transitionAgentRunStatus,
    updateAgentRunProgress,
    updateAgentRunState,
  } = await import('../../../server/src/services/agent/run.service.js');
  const { publishAgentEvent } = await import('../../../server/src/services/agent/pubsub.service.js');
  const { createAgentCheckpoint, markBestCheckpoint, restoreAgentCheckpoint } = await import('../../../server/src/services/agent/checkpoint.service.js');
  const { createAgentAction, startAgentAction, completeAgentAction, createAgentObservation, createAgentDecision } = await import('../../../server/src/services/agent/log.service.js');
  const { chooseNextAgentAction, shouldStopForBudget } = await import('../../../server/src/services/agent/action-planner.service.js');
  const { buildDefaultDesignProfile } = await import('../../../server/src/services/agent/design-profile.service.js');
  const { buildScorecardFromExportReview, isMeaningfulImprovement, isTargetQuality } = await import('../../../server/src/services/agent/scorecard.service.js');
  const { refreshLayoutPlansFromReview } = await import('../../../server/src/services/agent/layout-refresh.service.js');
  const { expandRandomTablesFromBacklog } = await import('../../../server/src/services/agent/random-table-expander.service.js');
  const { repairStatBlocksFromBacklog } = await import('../../../server/src/services/agent/stat-block-repair.service.js');
  const { densifySectionUtilityFromBacklog } = await import('../../../server/src/services/agent/utility-densifier.service.js');
  const { createAgentGeneratedArtifactIfPossible } = await import('../../../server/src/services/agent/artifact.service.js');
  const { createRun } = await import('../../../server/src/services/generation/run.service.js');
  const { enqueueGenerationRun } = await import('../../../server/src/services/generation/queue.service.js');
  const { createExportJob } = await import('../../../server/src/services/export.service.js');

  async function refreshRun() {
    const run = await getAgentRun(agentRunId, userId);
    if (!run) throw new Error('Agent run not found.');
    return run;
  }

  async function setStatus(status: Parameters<typeof transitionAgentRunStatus>[2], progressPercent: number) {
    const current = await refreshRun();
    if (current.status !== status) {
      await transitionAgentRunStatus(agentRunId, userId, status);
    }
    const updated = await updateAgentRunProgress(agentRunId, userId, status, progressPercent);
    const eventStatus = updated?.status ?? status;
    await publishAgentEvent(agentRunId, {
      type: 'run_status',
      runId: agentRunId,
      status: eventStatus,
      stage: status,
      progressPercent: updated?.progressPercent ?? progressPercent,
    });
  }

  async function checkpointAndPublish(input: {
    label: string;
    summary?: string | null;
    cycleIndex: number;
    scorecard?: any;
    isBest?: boolean;
  }) {
    const checkpoint = await createAgentCheckpoint({
      runId: agentRunId,
      projectId,
      label: input.label,
      summary: input.summary ?? null,
      cycleIndex: input.cycleIndex,
      scorecard: input.scorecard ?? null,
      isBest: input.isBest ?? false,
    });

    await updateAgentRunState({
      runId: agentRunId,
      latestCheckpointId: checkpoint.id,
      ...(input.isBest ? { bestCheckpointId: checkpoint.id } : {}),
    });

    await publishAgentEvent(agentRunId, {
      type: 'checkpoint_created',
      runId: agentRunId,
      checkpointId: checkpoint.id,
      label: checkpoint.label,
      isBest: checkpoint.isBest,
    });

    return checkpoint;
  }

  const startedAt = Date.now();
  let bestCheckpointId: string | null = null;
  let bestScorecard: any = null;
  let currentRun = await refreshRun();
  let designProfile = currentRun.designProfile;
  let cycleCount = currentRun.cycleCount;
  let exportCount = currentRun.exportCount;
  let noImprovementStreak = currentRun.noImprovementStreak;
  let projectChangedSinceLastExport = false;

  try {
    if (currentRun.mode === 'background_producer' && !currentRun.linkedGenerationRunId) {
      await setStatus('seeding', 4);

      const action = await createAgentAction({
        runId: agentRunId,
        cycleIndex: 0,
        actionType: 'seed_generation',
        rationale: 'Create the first deterministic draft before entering the autonomous improvement loop.',
        input: currentRun.goal,
      });
      await startAgentAction(action.id);
      await publishAgentEvent(agentRunId, {
        type: 'action_started',
        runId: agentRunId,
        actionId: action.id,
        actionType: action.actionType,
        cycleIndex: 0,
      });

      const seedRun = await createRun({
        projectId,
        userId,
        prompt: currentRun.goal.prompt ?? currentRun.goal.objective,
        mode: currentRun.goal.generationMode,
        quality: currentRun.goal.generationQuality,
        pageTarget: currentRun.goal.pageTarget ?? undefined,
      });
      if (!seedRun) throw new Error('Failed to create seed generation run.');

      await updateAgentRunState({
        runId: agentRunId,
        linkedGenerationRunId: seedRun.id,
      });
      await enqueueGenerationRun(seedRun.id, userId, projectId);
      await waitForGenerationRunCompletion(seedRun.id);

      await completeAgentAction({
        actionId: action.id,
        result: { generationRunId: seedRun.id },
      });
      await publishAgentEvent(agentRunId, {
        type: 'action_completed',
        runId: agentRunId,
        actionId: action.id,
        actionType: action.actionType,
        cycleIndex: 0,
        summary: 'Seed generation completed.',
      });
      currentRun = await refreshRun();
    }

    await setStatus('observing', 8);

    if (!designProfile) {
      const project = await prisma.project.findUniqueOrThrow({
        where: { id: projectId },
        select: { title: true },
      });
      designProfile = buildDefaultDesignProfile(project.title);
      await updateAgentRunState({
        runId: agentRunId,
        designProfile,
        currentStrategy: 'Establishing the DM-ready house style and critique baseline.',
      });
      await createAgentObservation({
        runId: agentRunId,
        cycleIndex: 0,
        observationType: 'design_profile',
        summary: `Established design profile "${designProfile.title}".`,
        payload: designProfile,
      });
      await createAgentGeneratedArtifactIfPossible({
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
          ...designProfile.constraints.map((constraint) => `- **${constraint.code}**: ${constraint.description}`),
        ].join('\n'),
      });
      await publishAgentEvent(agentRunId, {
        type: 'design_profile_created',
        runId: agentRunId,
        title: designProfile.title,
      });
    }

    const initialCheckpoint = await checkpointAndPublish({
      label: 'Initial project snapshot',
      summary: 'Baseline reversible snapshot before autonomous mutations.',
      cycleIndex: 0,
      isBest: true,
    });
    bestCheckpointId = initialCheckpoint.id;
    await updateAgentRunState({
      runId: agentRunId,
      bestCheckpointId,
      latestCheckpointId: initialCheckpoint.id,
    });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const runnable = await waitForAgentRunnable(agentRunId);
      if (runnable === 'cancelled') {
        await publishAgentEvent(agentRunId, {
          type: 'run_warning',
          runId: agentRunId,
          message: 'Agent run cancelled.',
          severity: 'warning',
        });
        return;
      }

      const budgetStopReason = shouldStopForBudget({
        budget: currentRun.budget,
        cycleCount,
        exportCount,
        noImprovementStreak,
        startedAt,
      });
      if (budgetStopReason) {
        await createAgentDecision({
          runId: agentRunId,
          cycleIndex: cycleCount,
          decisionType: 'stop',
          rationale: budgetStopReason,
        });
        await publishAgentEvent(agentRunId, {
          type: 'decision_made',
          runId: agentRunId,
          cycleIndex: cycleCount,
          actionType: null,
          rationale: budgetStopReason,
        });
        break;
      }

      const cycleIndex = cycleCount + 1;
      await setStatus('observing', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 0));

      const observeAction = await createAgentAction({
        runId: agentRunId,
        cycleIndex,
        actionType: 'create_export_review',
        rationale: 'Export the current project state to gather real layout and DM-usability findings.',
      });
      await startAgentAction(observeAction.id);
      await publishAgentEvent(agentRunId, {
        type: 'action_started',
        runId: agentRunId,
        actionId: observeAction.id,
        actionType: observeAction.actionType,
        cycleIndex,
      });

      const exportJob = await createExportJob(projectId, userId, 'pdf');
      if (!exportJob) throw new Error('Failed to create export job for agent review.');
      exportCount += 1;
      await updateAgentRunState({ runId: agentRunId, exportCount });

      const completedExport = await waitForExportCompletion(exportJob.id);
      const review = completedExport.reviewJson as any;
      if (!review) {
        throw new Error('Agent review export completed without review data.');
      }

      await completeAgentAction({
        actionId: observeAction.id,
        result: { exportJobId: completedExport.id },
      });
      await publishAgentEvent(agentRunId, {
        type: 'action_completed',
        runId: agentRunId,
        actionId: observeAction.id,
        actionType: observeAction.actionType,
        cycleIndex,
        summary: 'Captured export review.',
      });

      await setStatus('evaluating', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 8));

      const { scorecard, backlog } = buildScorecardFromExportReview(completedExport.id, review);
      await createAgentObservation({
        runId: agentRunId,
        cycleIndex,
        observationType: 'export_review',
        summary: review.summary,
        payload: review,
      });
      await createAgentObservation({
        runId: agentRunId,
        cycleIndex,
        observationType: 'scorecard',
        summary: `Scored ${scorecard.overallScore}/100 with ${scorecard.blockingFindingCount} blocking and ${scorecard.warningFindingCount} warning findings.`,
        payload: scorecard,
      });
      await createAgentObservation({
        runId: agentRunId,
        cycleIndex,
        observationType: 'backlog',
        summary: `Built a critique backlog with ${backlog.length} actionable findings.`,
        payload: backlog,
      });

      const improved = isMeaningfulImprovement(bestScorecard, scorecard);
      const reviewCheckpoint = await checkpointAndPublish({
        label: `Cycle ${cycleIndex} review`,
        summary: review.summary,
        cycleIndex,
        scorecard,
        isBest: improved,
      });

      if (improved) {
        bestScorecard = scorecard;
        bestCheckpointId = reviewCheckpoint.id;
        noImprovementStreak = 0;
        await markBestCheckpoint(agentRunId, reviewCheckpoint.id);
      } else {
        noImprovementStreak += 1;
      }

      cycleCount = cycleIndex;
      projectChangedSinceLastExport = false;
      await updateAgentRunState({
        runId: agentRunId,
        latestScorecard: scorecard,
        critiqueBacklog: backlog,
        bestCheckpointId,
        latestCheckpointId: reviewCheckpoint.id,
        cycleCount,
        exportCount,
        noImprovementStreak,
      });
      await publishAgentEvent(agentRunId, {
        type: 'score_updated',
        runId: agentRunId,
        scorecard,
      });

      if (isTargetQuality(scorecard)) {
        const rationale = 'The latest scorecard meets the DM-ready quality threshold and no blocking review findings remain.';
        await createAgentDecision({
          runId: agentRunId,
          cycleIndex,
          decisionType: 'stop',
          rationale,
        });
        await publishAgentEvent(agentRunId, {
          type: 'decision_made',
          runId: agentRunId,
          cycleIndex,
          actionType: null,
          rationale,
        });
        break;
      }

      await setStatus('planning', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 14));

      const plan = chooseNextAgentAction({
        backlog,
        scorecard,
        designProfile: designProfile!,
        budget: currentRun.budget,
        cycleCount,
        exportCount,
      });
      await updateAgentRunState({
        runId: agentRunId,
        currentStrategy: plan.rationale,
      });
      await createAgentDecision({
        runId: agentRunId,
        cycleIndex,
        decisionType: plan.actionType === 'no_op' ? 'stop' : 'cycle_plan',
        chosenActionType: plan.actionType,
        rationale: plan.rationale,
        payload: plan,
      });
      await publishAgentEvent(agentRunId, {
        type: 'decision_made',
        runId: agentRunId,
        cycleIndex,
        actionType: plan.actionType,
        rationale: plan.rationale,
      });

      if (plan.actionType === 'no_op') {
        break;
      }

      await setStatus('acting', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 22));

      const action = await createAgentAction({
        runId: agentRunId,
        cycleIndex,
        actionType: plan.actionType,
        rationale: plan.rationale,
        input: plan,
      });
      await startAgentAction(action.id);
      await publishAgentEvent(agentRunId, {
        type: 'action_started',
        runId: agentRunId,
        actionId: action.id,
        actionType: action.actionType,
        cycleIndex,
      });

      const targetedBacklog = plan.targetTitle
        ? backlog.filter((item) => item.targetTitle === plan.targetTitle)
        : backlog;

      let actionResult: Record<string, unknown>;
      switch (plan.actionType) {
        case 'refresh_layout_plan':
          actionResult = await refreshLayoutPlansFromReview({
            projectId,
            review,
            targetTitle: plan.targetTitle,
          });
          break;
        case 'expand_random_tables':
          actionResult = await expandRandomTablesFromBacklog({
            projectId,
            userId,
            backlog: targetedBacklog.filter((item) => item.code === 'EXPORT_THIN_RANDOM_TABLE'),
          });
          break;
        case 'repair_stat_blocks':
          actionResult = await repairStatBlocksFromBacklog({
            projectId,
            userId,
            backlog: targetedBacklog.filter((item) => item.code === 'EXPORT_PLACEHOLDER_STAT_BLOCK' || item.code === 'EXPORT_SUSPICIOUS_STAT_BLOCK'),
          });
          break;
        case 'densify_section_utility':
          actionResult = await densifySectionUtilityFromBacklog({
            projectId,
            userId,
            backlog: targetedBacklog.filter((item) => item.code === 'EXPORT_LOW_UTILITY_DENSITY'),
          });
          break;
        default:
          actionResult = {};
          break;
      }

      await completeAgentAction({
        actionId: action.id,
        result: actionResult,
      });
      await publishAgentEvent(agentRunId, {
        type: 'action_completed',
        runId: agentRunId,
        actionId: action.id,
        actionType: action.actionType,
        cycleIndex,
        summary: typeof actionResult.documentsUpdated === 'number'
          ? `Updated ${actionResult.documentsUpdated} document(s).`
          : 'Applied autonomous mutation.',
      });

      projectChangedSinceLastExport = true;
      await setStatus('checkpointing', progressForCycle(cycleIndex, currentRun.budget.maxCycles, 28));
      await checkpointAndPublish({
        label: `Cycle ${cycleIndex} mutation`,
        summary: plan.rationale,
        cycleIndex,
      });
    }

    if (bestCheckpointId) {
      const latestRun = await refreshRun();
      if (latestRun.latestCheckpointId !== bestCheckpointId) {
        const restored = await restoreAgentCheckpoint(agentRunId, bestCheckpointId, userId);
        if (restored) {
          projectChangedSinceLastExport = true;
          await updateAgentRunState({
            runId: agentRunId,
            latestCheckpointId: restored.id,
            bestCheckpointId: restored.id,
          });
          await publishAgentEvent(agentRunId, {
            type: 'checkpoint_restored',
            runId: agentRunId,
            checkpointId: restored.id,
            label: restored.label,
          });
        }
      }
    }

    if (projectChangedSinceLastExport && exportCount < currentRun.budget.maxExports) {
      await setStatus('observing', 96);
      const finalExport = await createExportJob(projectId, userId, 'pdf');
      if (finalExport) {
        exportCount += 1;
        await updateAgentRunState({ runId: agentRunId, exportCount });
        await waitForExportCompletion(finalExport.id);
      }
    }

    const finalRun = await refreshRun();
    const report = {
      goal: finalRun.goal,
      budget: finalRun.budget,
      cycleCount: finalRun.cycleCount,
      exportCount,
      latestScorecard: finalRun.latestScorecard,
      bestCheckpointId,
      critiqueBacklog: finalRun.critiqueBacklog,
    };
    await createAgentGeneratedArtifactIfPossible({
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
        `- Exports: ${exportCount}`,
        `- Best checkpoint: ${bestCheckpointId ?? 'none'}`,
        finalRun.latestScorecard ? `- Latest score: ${finalRun.latestScorecard.overallScore}` : '- Latest score: unavailable',
      ].join('\n'),
    });

    await setStatus('evaluating', 99);
    await transitionAgentRunStatus(agentRunId, userId, 'completed');
    await updateAgentRunProgress(agentRunId, userId, null, 100);
    await publishAgentEvent(agentRunId, {
      type: 'run_completed',
      runId: agentRunId,
      bestCheckpointId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await transitionAgentRunStatus(agentRunId, userId, 'failed', reason);
    await publishAgentEvent(agentRunId, {
      type: 'run_failed',
      runId: agentRunId,
      reason,
    });
    throw error;
  }
}
