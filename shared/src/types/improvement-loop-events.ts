import type { ImprovementLoopArtifactType, ImprovementLoopRunStatus } from './improvement-loop.js';

export type ImprovementLoopEvent =
  | { type: 'run_status'; runId: string; status: ImprovementLoopRunStatus; stage: string | null; progressPercent: number }
  | { type: 'child_run_linked'; runId: string; childKind: 'generation' | 'agent'; childRunId: string }
  | { type: 'artifact_created'; runId: string; artifactId: string; artifactType: ImprovementLoopArtifactType; title: string; version: number }
  | { type: 'engineering_applied'; runId: string; branchName: string | null; pullRequestNumber: number | null; pullRequestUrl: string | null; status: 'applied' | 'partial' | 'skipped' | 'failed' }
  | { type: 'run_warning'; runId: string; message: string; severity: 'info' | 'warning' | 'error' }
  | { type: 'run_completed'; runId: string }
  | { type: 'run_failed'; runId: string; reason: string };
