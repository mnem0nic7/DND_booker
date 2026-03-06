import type { RunStatus } from './generation-run';
import type { TaskStatus } from './generation-task';

export type GenerationEvent =
  | { type: 'run_status'; runId: string; status: RunStatus; stage: string | null; progressPercent: number }
  | { type: 'task_started'; runId: string; taskId: string; taskType: string }
  | { type: 'task_completed'; runId: string; taskId: string; taskType: string; status: TaskStatus }
  | { type: 'artifact_created'; runId: string; artifactId: string; artifactType: string; title: string; version: number }
  | { type: 'artifact_evaluated'; runId: string; artifactId: string; passed: boolean; overallScore: number }
  | { type: 'run_warning'; runId: string; message: string; severity: 'info' | 'warning' | 'error' }
  | { type: 'run_completed'; runId: string }
  | { type: 'run_failed'; runId: string; reason: string };
