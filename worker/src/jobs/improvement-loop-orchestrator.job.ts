import type { Job } from 'bullmq';
import type {
  AgentRun,
  EngineeringApplyResult,
  ImprovementLoopRole,
  ImprovementLoopRunStatus,
} from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import {
  runPersistedGraph,
  type PersistedGraphSnapshot,
} from '../graph/persisted-graph.js';

export interface ImprovementLoopJobData {
  runId: string;
  userId: string;
  projectId: string;
}

interface ImprovementLoopGraphData extends Record<string, unknown> {
  creatorChildRunId: string | null;
  designerChildRunId: string | null;
  engineeringBranchName: string | null;
  stopReason: string | null;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasRetryRemaining(job: Job<ImprovementLoopJobData>) {
  const attempts = typeof job.opts.attempts === 'number' ? job.opts.attempts : 1;
  return job.attemptsMade + 1 < attempts;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function buildRuntimePatch(
  snapshot: PersistedGraphSnapshot<ImprovementLoopGraphData>,
  graphCheckpointKey: string | null,
) {
  const resumeToken = `${graphCheckpointKey ?? 'improvement_loop'}:${snapshot.currentNode ?? 'completed'}:${snapshot.stepCount}`;
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

function readRuntimeState(graphStateJson: unknown) {
  if (!isRecord(graphStateJson)) return null;
  return graphStateJson.runtime ?? null;
}

function projectLooksSubstantial(contents: unknown[]): boolean {
  return contents.some((content) => {
    if (!content || typeof content !== 'object') return false;
    const json = JSON.stringify(content);
    if (json.length > 320) return true;
    if (!isRecord(content)) return false;
    const nodes = Array.isArray(content.content) ? content.content : [];
    return nodes.some((node) => isRecord(node) && node.type !== 'paragraph');
  });
}

function allowlistIncludesPath(allowlist: string[], filePath: string) {
  return allowlist.some((entry) => {
    const normalized = entry.trim();
    if (!normalized) return false;
    if (normalized.endsWith('/')) return filePath.startsWith(normalized);
    if (normalized.endsWith('/**')) return filePath.startsWith(normalized.slice(0, -2));
    return normalized === filePath;
  });
}

async function loadImprovementLoopDependencies() {
  const runService = await import('../../../server/src/services/improvement-loop/run.service.js');
  const artifactService = await import('../../../server/src/services/improvement-loop/artifact.service.js');
  const pubsubService = await import('../../../server/src/services/improvement-loop/pubsub.service.js');
  const reportService = await import('../../../server/src/services/improvement-loop/report.service.js');
  const generationRunService = await import('../../../server/src/services/generation/run.service.js');
  const generationQueueService = await import('../../../server/src/services/generation/queue.service.js');
  const agentRunService = await import('../../../server/src/services/agent/run.service.js');
  const agentQueueService = await import('../../../server/src/services/agent/queue.service.js');
  const interruptService = await import('../../../server/src/services/graph/interrupt.service.js');
  const githubBindingService = await import('../../../server/src/services/project-github-repo-binding.service.js');
  const githubAppService = await import('../../../server/src/services/github-app.service.js');

  return {
    ...runService,
    ...artifactService,
    ...pubsubService,
    ...reportService,
    createGenerationRun: generationRunService.createRun,
    enqueueGenerationRun: generationQueueService.enqueueGenerationRun,
    getGenerationRun: generationRunService.getRun,
    transitionGenerationRunStatus: generationRunService.transitionRunStatus,
    ...agentRunService,
    enqueueAgentRun: agentQueueService.enqueueAgentRun,
    ...interruptService,
    ...githubBindingService,
    ...githubAppService,
  };
}

async function loadLoopControlState(runId: string) {
  const run = await prisma.improvementLoopRun.findUnique({
    where: { id: runId },
    select: { status: true },
  });
  if (!run) throw new Error('Improvement loop no longer exists.');
  if (run.status === 'cancelled') return 'cancelled' as const;
  if (run.status === 'paused') return 'paused' as const;
  return 'active' as const;
}

async function countGenerationEvaluations(runId: string) {
  return prisma.artifactEvaluation.count({
    where: { artifact: { runId } },
  });
}

const STAGE_TO_ROLE: Record<string, ImprovementLoopRole> = {
  creator: 'creator',
  designer: 'designer',
  editor: 'editor',
  engineering: 'engineer',
};

export async function processImprovementLoop(job: Job<ImprovementLoopJobData>): Promise<void> {
  const { runId, userId, projectId } = job.data;
  const dependencies = await loadImprovementLoopDependencies();
  const initialRun = await dependencies.getImprovementLoopRun(runId, userId);

  if (!initialRun) {
    throw new Error('Improvement loop run not found.');
  }

  async function refreshRun() {
    const run = await dependencies.getImprovementLoopRun(runId, userId);
    if (!run) throw new Error('Improvement loop run not found.');
    return run;
  }

  async function setStatus(status: ImprovementLoopRunStatus, progressPercent: number) {
    const current = await refreshRun();
    if (current.status !== status) {
      await dependencies.transitionImprovementLoopStatus(runId, userId, status);
    }
    const updated = await dependencies.updateImprovementLoopProgress(runId, userId, status, progressPercent);
    await dependencies.publishImprovementLoopEvent(runId, {
      type: 'run_status',
      runId,
      status: updated?.status ?? status,
      stage: updated?.currentStage ?? status,
      progressPercent: updated?.progressPercent ?? progressPercent,
    });
  }

  async function createArtifactAndPublish(
    input: Parameters<typeof dependencies.createImprovementLoopArtifact>[0],
    role?: ImprovementLoopRole,
  ) {
    const artifact = await dependencies.createImprovementLoopArtifact(input);
    if (role) {
      await dependencies.updateImprovementLoopRoleRun({
        runId,
        role,
        outputArtifactId: artifact.id,
        summary: input.summary ?? null,
      });
    }
    await dependencies.publishImprovementLoopEvent(runId, {
      type: 'artifact_created',
      runId,
      artifactId: artifact.id,
      artifactType: artifact.artifactType,
      title: artifact.title,
      version: artifact.version,
    });
    return artifact;
  }

  async function ensureRole(role: ImprovementLoopRole, objective: string, stageInput?: Record<string, unknown> | null) {
    await dependencies.ensureImprovementLoopRoleRun({
      runId,
      projectId,
      userId,
      role,
      objective,
      stageInput,
    });
  }

  async function markRoleRunning(role: ImprovementLoopRole, summary?: string | null, stageInput?: Record<string, unknown> | null) {
    await dependencies.updateImprovementLoopRoleRun({
      runId,
      role,
      status: 'running',
      summary: summary ?? null,
      ...(stageInput !== undefined ? { stageInput } : {}),
    });
  }

  async function markRoleCompleted(role: ImprovementLoopRole, summary?: string | null) {
    await dependencies.updateImprovementLoopRoleRun({
      runId,
      role,
      status: 'completed',
      summary: summary ?? null,
    });
  }

  async function markRoleFailed(role: ImprovementLoopRole, reason: string) {
    await dependencies.updateImprovementLoopRoleRun({
      runId,
      role,
      status: 'failed',
      summary: reason,
      failureReason: reason,
    });
  }

  async function waitForGenerationRunCompletion(childRunId: string) {
    const timeoutAt = Date.now() + 60 * 60 * 1000;

    while (Date.now() < timeoutAt) {
      const run = await prisma.generationRun.findUnique({
        where: { id: childRunId },
        select: {
          id: true,
          status: true,
          currentStage: true,
          failureReason: true,
          projectId: true,
          userId: true,
        },
      });
      if (!run) throw new Error('Creator generation run not found.');
      if (run.status === 'completed') return run;
      if (run.status === 'failed' || run.status === 'cancelled') {
        throw new Error(run.failureReason ?? `Creator generation run ${run.status}.`);
      }
      if (run.status === 'paused') {
        const interrupts = await dependencies.listGenerationRunInterrupts(childRunId, userId);
        const pending = (interrupts ?? []).filter((interrupt: { status: string }) => interrupt.status === 'pending');
        for (const interrupt of pending) {
          await dependencies.resolveGenerationRunInterrupt(childRunId, userId, interrupt.id, 'approve', undefined);
        }
        if (pending.length > 0) {
          await dependencies.transitionGenerationRunStatus(childRunId, userId, (run.currentStage ?? 'planning') as any);
          await dependencies.enqueueGenerationRun(childRunId, userId, projectId, { priority: 10 });
        }
      }
      await sleep(3000);
    }

    throw new Error('Timed out waiting for creator generation run.');
  }

  async function waitForAgentRunCompletion(childRunId: string) {
    const timeoutAt = Date.now() + 60 * 60 * 1000;

    while (Date.now() < timeoutAt) {
      const run = await prisma.agentRun.findUnique({
        where: { id: childRunId },
        select: {
          id: true,
          status: true,
          currentStage: true,
          failureReason: true,
        },
      });
      if (!run) throw new Error('Designer agent run not found.');
      if (run.status === 'completed') return dependencies.getAgentRun(childRunId, userId) as Promise<AgentRun>;
      if (run.status === 'failed' || run.status === 'cancelled') {
        throw new Error(run.failureReason ?? `Designer agent run ${run.status}.`);
      }
      if (run.status === 'paused') {
        const interrupts = await dependencies.listAgentRunInterrupts(childRunId, userId);
        const pending = (interrupts ?? []).filter((interrupt: { status: string }) => interrupt.status === 'pending');
        for (const interrupt of pending) {
          await dependencies.resolveAgentRunInterrupt(childRunId, userId, interrupt.id, 'approve', undefined);
        }
        if (pending.length > 0) {
          await dependencies.transitionAgentRunStatus(childRunId, userId, (run.currentStage ?? 'observing') as any);
        }
      }
      await sleep(3000);
    }

    throw new Error('Timed out waiting for designer agent run.');
  }

  try {
    await setStatus('queued', 0);

    const graphResult = await runPersistedGraph<ImprovementLoopGraphData, undefined>({
      startNode: 'bootstrapping_project',
      initialData: {
        creatorChildRunId: null,
        designerChildRunId: null,
        engineeringBranchName: null,
        stopReason: null,
      },
      loadSnapshot: () => readRuntimeState(initialRun.graphStateJson),
      externalContext: undefined,
      checkControl: async () => loadLoopControlState(runId),
      pauseBehavior: 'wait',
      persistSnapshot: async (snapshot) => {
        await dependencies.updateImprovementLoopGraphState({
          runId,
          userId,
          patch: buildRuntimePatch(snapshot, initialRun.graphCheckpointKey ?? null),
        });
      },
      nodes: {
        bootstrapping_project: async () => {
          await setStatus('bootstrapping_project', 5);
          const binding = await dependencies.getProjectGitHubRepoBinding(projectId, userId);
          if (!binding || binding.lastValidationStatus !== 'valid') {
            throw new Error('A valid GitHub repo binding is required before the improvement loop can start.');
          }
          return { nextNode: 'creator' };
        },

        creator: async ({ data, persistData }) => {
          await setStatus('creator', 20);
          const currentRun = await refreshRun();
          const project = await prisma.project.findUniqueOrThrow({
            where: { id: projectId },
            select: { title: true },
          });

          const documents = await prisma.projectDocument.findMany({
            where: { projectId },
            select: { content: true },
          });

          const substantialContentDetected = projectLooksSubstantial(documents.map((document) => document.content));
          const shouldGenerate = currentRun.mode === 'create_campaign' || !substantialContentDetected;
          const creatorObjective = shouldGenerate
            ? 'Create the initial campaign package and hand it off to the rest of the AI team.'
            : 'Synthesize the current project into creator-ready planning context without overwriting authored content.';
          await ensureRole('creator', creatorObjective, {
            mode: currentRun.mode,
            shouldGenerate,
            substantialContentDetected,
            prompt: currentRun.input.prompt,
          });
          await markRoleRunning('creator', shouldGenerate ? 'Creator is generating the initial campaign package.' : 'Creator is synthesizing the current project state.');

          let creatorChildRunId = data.creatorChildRunId;
          if (shouldGenerate) {
            if (!creatorChildRunId) {
              const seedRun = await dependencies.createGenerationRun({
                projectId,
                userId,
                prompt: currentRun.input.prompt ?? currentRun.input.objective,
                mode: 'campaign',
                quality: currentRun.input.generationQuality,
              });
              if (!seedRun) throw new Error('Failed to create creator generation run.');
              creatorChildRunId = seedRun.id;
              await dependencies.updateImprovementLoopState({
                runId,
                linkedGenerationRunId: seedRun.id,
              });
              await dependencies.updateImprovementLoopRoleRun({
                runId,
                role: 'creator',
                linkedGenerationRunId: seedRun.id,
              });
              await dependencies.enqueueGenerationRun(seedRun.id, userId, projectId, { priority: 10 });
              await dependencies.publishImprovementLoopEvent(runId, {
                type: 'child_run_linked',
                runId,
                childKind: 'generation',
                childRunId: seedRun.id,
              });
              await persistData({ creatorChildRunId });
            }

            await waitForGenerationRunCompletion(creatorChildRunId);
          }

          const creatorReport = dependencies.buildCreatorReport({
            mode: shouldGenerate ? 'generated_campaign' : 'synthesized_existing_project',
            prompt: currentRun.input.prompt,
            substantialContentDetected,
            linkedGenerationRunId: creatorChildRunId ?? null,
            projectTitle: project.title,
          });

          await dependencies.updateImprovementLoopState({
            runId,
            linkedGenerationRunId: creatorChildRunId ?? null,
            creatorReport,
          });
          await createArtifactAndPublish({
            runId,
            projectId,
            artifactType: 'creator_report',
            artifactKey: `creator-report-${runId}`,
            title: 'Creator Report',
            summary: creatorReport.summary,
            jsonContent: creatorReport,
            markdownContent: [
              '# Creator Report',
              '',
              creatorReport.summary,
              '',
              ...creatorReport.notes.map((note: string) => `- ${note}`),
            ].join('\n'),
          }, 'creator');
          await markRoleCompleted('creator', creatorReport.summary);

          return {
            nextNode: 'designer',
            data: {
              creatorChildRunId: creatorChildRunId ?? null,
            },
          };
        },

        designer: async ({ data, persistData }) => {
          await setStatus('designer', 48);
          const currentRun = await refreshRun();
          const designerObjective = 'Improve the campaign package for DM utility, presentation quality, layout quality, and publication readiness.';
          await ensureRole('designer', designerObjective, {
            objective: currentRun.input.objective,
            generationQuality: currentRun.input.generationQuality,
            executionMode: 'autonomous_agent',
          });
          await markRoleRunning('designer', 'Designer is running the autonomous improvement pass.');
          let designerChildRunId = data.designerChildRunId;

          if (!designerChildRunId) {
            const childRun = await dependencies.createAgentRun({
              projectId,
              userId,
              mode: 'persistent_editor',
              objective: [
                currentRun.input.objective,
                'Improve the project into a stronger DM-ready campaign package with better utility density, cleaner layout, and stronger export quality.',
              ].join(' '),
              generationMode: 'campaign',
              generationQuality: currentRun.input.generationQuality,
            });
            if (!childRun) throw new Error('Failed to create designer child agent run.');
            designerChildRunId = childRun.id;
            await dependencies.updateImprovementLoopState({
              runId,
              linkedAgentRunId: childRun.id,
            });
            await dependencies.updateImprovementLoopRoleRun({
              runId,
              role: 'designer',
              linkedAgentRunId: childRun.id,
            });
            await dependencies.enqueueAgentRun(childRun.id, userId, projectId, { priority: 10 });
            await dependencies.publishImprovementLoopEvent(runId, {
              type: 'child_run_linked',
              runId,
              childKind: 'agent',
              childRunId: childRun.id,
            });
            await persistData({ designerChildRunId });
          }

          const childRun = await waitForAgentRunCompletion(designerChildRunId);
          const designerUxNotes = dependencies.buildDesignerUxNotes({
            childAgentRun: childRun,
            scorecard: childRun.latestScorecard,
            backlog: childRun.critiqueBacklog,
          });

          await dependencies.updateImprovementLoopState({
            runId,
            linkedAgentRunId: childRun.id,
            designerUxNotes,
          });
          await createArtifactAndPublish({
            runId,
            projectId,
            artifactType: 'designer_ux_notes',
            artifactKey: `designer-ux-notes-${runId}`,
            title: 'Designer UX Notes',
            summary: designerUxNotes.summary,
            jsonContent: designerUxNotes,
            markdownContent: [
              '# Designer UX Notes',
              '',
              designerUxNotes.summary,
              '',
              '## Observations',
              ...designerUxNotes.observations.map((value: string) => `- ${value}`),
              '',
              '## Friction Points',
              ...(designerUxNotes.frictionPoints.length > 0
                ? designerUxNotes.frictionPoints.map((value: string) => `- ${value}`)
                : ['- No material friction points were recorded.']),
              '',
              '## Recommendations',
              ...designerUxNotes.recommendations.map((value: string) => `- ${value}`),
            ].join('\n'),
          }, 'designer');
          await markRoleCompleted('designer', designerUxNotes.summary);

          return {
            nextNode: 'editor',
            data: {
              designerChildRunId,
            },
          };
        },

        editor: async () => {
          await setStatus('editor', 72);
          const currentRun = await refreshRun();
          const editorObjective = 'Independently score the resulting campaign package and issue a release recommendation.';
          await ensureRole('editor', editorObjective, {
            rubric: 'campaign_release_review',
          });
          await markRoleRunning('editor', 'Editor is scoring the latest campaign package.');
          const project = await prisma.project.findUniqueOrThrow({
            where: { id: projectId },
            select: { title: true },
          });

          const generationEvaluationCount = currentRun.linkedGenerationRunId
            ? await countGenerationEvaluations(currentRun.linkedGenerationRunId)
            : 0;

          const childAgentRun = currentRun.linkedAgentRunId
            ? await dependencies.getAgentRun(currentRun.linkedAgentRunId, userId)
            : null;

          const editorFinalReport = dependencies.buildEditorFinalReport({
            scorecard: childAgentRun?.latestScorecard ?? null,
            critiqueBacklog: childAgentRun?.critiqueBacklog ?? [],
            generationEvaluationCount,
            projectTitle: project.title,
          });

          await dependencies.updateImprovementLoopState({
            runId,
            editorFinalReport,
          });
          await createArtifactAndPublish({
            runId,
            projectId,
            artifactType: 'editor_final_report',
            artifactKey: `editor-final-report-${runId}`,
            title: 'Editor Final Report',
            summary: editorFinalReport.summary,
            jsonContent: editorFinalReport,
            markdownContent: [
              '# Editor Final Report',
              '',
              editorFinalReport.summary,
              '',
              `Overall score: ${editorFinalReport.overallScore}`,
              `Recommendation: ${editorFinalReport.recommendation}`,
            ].join('\n'),
          }, 'editor');
          await markRoleCompleted('editor', editorFinalReport.summary);

          return { nextNode: 'engineering' };
        },

        engineering: async () => {
          await setStatus('engineering', 88);
          const currentRun = await refreshRun();
          const engineerObjective = 'Translate loop findings into safe DND Booker system improvements and a draft GitHub PR when auto-apply is available.';
          await ensureRole('engineer', engineerObjective, {
            repository: 'mnem0nic7/DND_booker',
            autoApplyRequested: true,
          });
          await markRoleRunning('engineer', 'Engineer is reviewing loop telemetry and preparing GitHub changes.');
          const binding = await dependencies.getProjectGitHubRepoBinding(projectId, userId);
          if (!binding) {
            throw new Error('GitHub repo binding disappeared before engineering could run.');
          }

          const project = await prisma.project.findUniqueOrThrow({
            where: { id: projectId },
            select: { title: true },
          });
          const childAgentRun = currentRun.linkedAgentRunId
            ? await dependencies.getAgentRun(currentRun.linkedAgentRunId, userId)
            : null;
          const reportFilePath = `docs/improvement-loops/${runId}.md`;
          const applyPathEligible = binding.engineeringAutomationEnabled && allowlistIncludesPath(binding.pathAllowlist, reportFilePath);

          const engineeringReport = dependencies.buildEngineeringReport({
            loopInput: currentRun.input,
            editorFinalReport: currentRun.editorFinalReport!,
            designerUxNotes: currentRun.designerUxNotes,
            critiqueBacklog: childAgentRun?.critiqueBacklog ?? [],
            applyPathEligible,
          });

          let engineeringApplyResult: EngineeringApplyResult | null = null;
          try {
            if (!binding.engineeringAutomationEnabled) {
              engineeringApplyResult = {
                status: 'skipped',
                message: 'Engineering auto-apply skipped because GitHub automation is disabled for this project binding.',
                branchName: null,
                baseBranch: binding.defaultBranch,
                headSha: null,
                pullRequestNumber: null,
                pullRequestUrl: null,
                appliedPaths: [],
                deferredPaths: [reportFilePath],
              };
            } else if (applyPathEligible) {
              const branchName = `improvement-loop/${runId}`;
              await dependencies.ensureGitHubBranch({
                repositoryFullName: binding.repositoryFullName,
                installationId: binding.installationId,
                defaultBranch: binding.defaultBranch,
              }, branchName);

              const file = await dependencies.upsertGitHubFile({
                repositoryFullName: binding.repositoryFullName,
                installationId: binding.installationId,
                defaultBranch: binding.defaultBranch,
                branchName,
                filePath: reportFilePath,
                message: `docs: add improvement loop report ${runId}`,
                content: dependencies.buildEngineeringApplyMarkdown({
                  projectTitle: project.title,
                  report: engineeringReport,
                  editorFinalReport: currentRun.editorFinalReport!,
                  designerUxNotes: currentRun.designerUxNotes,
                }),
              });

              const pr = await dependencies.createOrUpdateGitHubDraftPullRequest({
                repositoryFullName: binding.repositoryFullName,
                installationId: binding.installationId,
                defaultBranch: binding.defaultBranch,
                branchName,
                title: `Improvement loop report for ${project.title}`,
                body: [
                  '## Improvement Loop',
                  '',
                  `This draft PR captures the engineering report generated by improvement loop \`${runId}\`.`,
                  '',
                  currentRun.editorFinalReport?.summary ?? 'No editor summary available.',
                ].join('\n'),
              });

              engineeringApplyResult = {
                status: 'applied',
                message: `Applied the engineering report to ${branchName} and opened draft PR #${pr.number}.`,
                branchName,
                baseBranch: binding.defaultBranch,
                headSha: file.sha,
                pullRequestNumber: pr.number,
                pullRequestUrl: pr.url,
                appliedPaths: [file.path],
                deferredPaths: engineeringReport.improvements
                  .filter((improvement: { autoApplyEligible: boolean }) => !improvement.autoApplyEligible)
                  .flatMap((improvement: { affectedPaths: string[] }) => improvement.affectedPaths),
              };
            } else {
              engineeringApplyResult = {
                status: 'skipped',
                message: `Engineering auto-apply skipped because ${reportFilePath} is outside the configured GitHub allowlist.`,
                branchName: null,
                baseBranch: binding.defaultBranch,
                headSha: null,
                pullRequestNumber: null,
                pullRequestUrl: null,
                appliedPaths: [],
                deferredPaths: [reportFilePath],
              };
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Engineering apply failed.';
            engineeringApplyResult = {
              status: 'failed',
              message,
              branchName: null,
              baseBranch: binding.defaultBranch,
              headSha: null,
              pullRequestNumber: null,
              pullRequestUrl: null,
              appliedPaths: [],
              deferredPaths: [reportFilePath],
            };
          }

          await dependencies.updateImprovementLoopState({
            runId,
            engineeringReport,
            engineeringApplyResult,
            githubBranchName: engineeringApplyResult.branchName,
            githubBaseBranch: engineeringApplyResult.baseBranch,
            githubHeadSha: engineeringApplyResult.headSha,
            githubPullRequestNumber: engineeringApplyResult.pullRequestNumber,
            githubPullRequestUrl: engineeringApplyResult.pullRequestUrl,
          });
          await createArtifactAndPublish({
            runId,
            projectId,
            artifactType: 'engineering_report',
            artifactKey: `engineering-report-${runId}`,
            title: 'Engineering Report',
            summary: engineeringReport.summary,
            jsonContent: engineeringReport,
            markdownContent: dependencies.buildEngineeringApplyMarkdown({
              projectTitle: project.title,
              report: engineeringReport,
              editorFinalReport: currentRun.editorFinalReport!,
              designerUxNotes: currentRun.designerUxNotes,
              applyResult: engineeringApplyResult,
            }),
          }, 'engineer');
          await createArtifactAndPublish({
            runId,
            projectId,
            artifactType: 'engineering_apply_result',
            artifactKey: `engineering-apply-result-${runId}`,
            title: 'Engineering Apply Result',
            summary: engineeringApplyResult.message,
            jsonContent: engineeringApplyResult,
            markdownContent: `# Engineering Apply Result\n\n${engineeringApplyResult.message}\n`,
          }, 'engineer');
          if (engineeringApplyResult.status === 'failed') {
            await markRoleFailed('engineer', engineeringApplyResult.message);
          } else {
            await markRoleCompleted('engineer', engineeringApplyResult.message);
          }

          await dependencies.publishImprovementLoopEvent(runId, {
            type: 'engineering_applied',
            runId,
            branchName: engineeringApplyResult.branchName,
            pullRequestNumber: engineeringApplyResult.pullRequestNumber,
            pullRequestUrl: engineeringApplyResult.pullRequestUrl,
            status: engineeringApplyResult.status,
          });

          return { nextNode: null };
        },
      },
    });

    if (graphResult.outcome === 'cancelled') {
      await dependencies.publishImprovementLoopEvent(runId, {
        type: 'run_warning',
        runId,
        message: 'Improvement loop cancelled.',
        severity: 'warning',
      });
      return;
    }

    await dependencies.transitionImprovementLoopStatus(runId, userId, 'completed');
    await dependencies.updateImprovementLoopProgress(runId, userId, null, 100);
    await dependencies.publishImprovementLoopEvent(runId, {
      type: 'run_completed',
      runId,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const willRetry = hasRetryRemaining(job);

    try {
      await dependencies.updateImprovementLoopGraphState({
        runId,
        userId,
        patch: {
          lastError: reason,
          lastErrorAt: new Date().toISOString(),
          retryPending: willRetry,
          attemptsMade: job.attemptsMade,
        },
      });

      if (willRetry) {
        await dependencies.publishImprovementLoopEvent(runId, {
          type: 'run_warning',
          runId,
          message: `Improvement loop worker attempt ${job.attemptsMade + 1} failed and will retry: ${reason}`,
          severity: 'warning',
        });
      } else {
        const failedRun = await dependencies.getImprovementLoopRun(runId, userId);
        const failedRole = STAGE_TO_ROLE[failedRun?.currentStage ?? failedRun?.status ?? ''];
        if (failedRole) {
          await markRoleFailed(failedRole, reason);
        }
        await dependencies.transitionImprovementLoopStatus(runId, userId, 'failed', reason);
        await dependencies.publishImprovementLoopEvent(runId, {
          type: 'run_failed',
          runId,
          reason,
        });
      }
    } catch (publishError) {
      console.error('[improvement-loop] Failed to persist retry/failure state:', publishError);
    }

    throw error;
  }
}
