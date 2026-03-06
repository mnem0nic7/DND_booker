export type TaskStatus =
  | 'queued'
  | 'blocked'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskType =
  | 'normalize_input'
  | 'generate_campaign_bible'
  | 'generate_chapter_outline'
  | 'generate_chapter_plan'
  | 'generate_npc_dossier'
  | 'generate_location_brief'
  | 'generate_faction_profile'
  | 'generate_encounter_bundle'
  | 'generate_item_bundle'
  | 'generate_chapter_draft'
  | 'generate_appendix_draft'
  | 'generate_front_matter'
  | 'generate_back_matter'
  | 'evaluate_artifact'
  | 'revise_artifact'
  | 'assemble_documents'
  | 'run_preflight';

export interface GenerationTask {
  id: string;
  runId: string;
  parentTaskId: string | null;
  taskType: TaskType;
  artifactType: string | null;
  artifactKey: string | null;
  status: TaskStatus;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  dependsOn: string[];
  inputPayload: unknown | null;
  resultPayload: unknown | null;
  errorMessage: string | null;
  tokenCount: number | null;
  costEstimate: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  runId: string;
  parentTaskId?: string;
  taskType: TaskType;
  artifactType?: string;
  artifactKey?: string;
  priority?: number;
  maxAttempts?: number;
  dependsOn?: string[];
  inputPayload?: unknown;
}

export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['blocked', 'running', 'cancelled'],
  blocked: ['queued', 'running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['queued'],
  cancelled: [],
};
