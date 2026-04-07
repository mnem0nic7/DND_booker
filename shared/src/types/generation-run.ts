export type RunStatus =
  | 'queued'
  | 'planning'
  | 'generating_assets'
  | 'generating_prose'
  | 'evaluating'
  | 'revising'
  | 'assembling'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type GenerationMode = 'one_shot' | 'module' | 'campaign' | 'sourcebook';

export type GenerationQuality = 'quick' | 'polished';

export interface GenerationRunInput {
  prompt: string;
  mode?: GenerationMode;
  quality?: GenerationQuality;
  pageTarget?: number;
  constraints?: GenerationConstraints;
}

export interface GenerationConstraints {
  tone?: string;
  levelRange?: string;
  settingPreference?: string;
  includeHandouts?: boolean;
  includeMaps?: boolean;
  strict5e?: boolean;
}

export interface GenerationRun {
  id: string;
  projectId: string;
  userId: string;
  mode: GenerationMode;
  quality: GenerationQuality;
  status: RunStatus;
  currentStage: string | null;
  inputPrompt: string;
  inputParameters: GenerationConstraints | null;
  progressPercent: number;
  estimatedPages: number | null;
  estimatedTokens: number | null;
  estimatedCost: number | null;
  actualTokens: number;
  actualCost: number;
  failureReason: string | null;
  graphThreadId?: string | null;
  graphCheckpointKey?: string | null;
  graphStateJson?: Record<string, unknown> | null;
  resumeToken?: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GenerationRunSummary {
  id: string;
  mode: GenerationMode;
  quality: GenerationQuality;
  status: RunStatus;
  currentStage: string | null;
  progressPercent: number;
  inputPrompt: string;
  graphThreadId?: string | null;
  graphCheckpointKey?: string | null;
  graphStateJson?: Record<string, unknown> | null;
  resumeToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunRequest {
  prompt: string;
  mode?: GenerationMode;
  quality?: GenerationQuality;
  pageTarget?: number;
  constraints?: GenerationConstraints;
}

export const RUN_STATUS_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  queued: ['planning', 'cancelled', 'failed'],
  planning: ['generating_assets', 'paused', 'cancelled', 'failed'],
  generating_assets: ['generating_prose', 'paused', 'cancelled', 'failed'],
  generating_prose: ['evaluating', 'assembling', 'paused', 'cancelled', 'failed'],
  evaluating: ['revising', 'assembling', 'paused', 'cancelled', 'failed'],
  revising: ['evaluating', 'assembling', 'paused', 'cancelled', 'failed'],
  assembling: ['completed', 'failed'],
  completed: [],
  failed: [],
  paused: ['planning', 'generating_assets', 'generating_prose', 'evaluating', 'revising', 'assembling', 'cancelled'],
  cancelled: [],
};
