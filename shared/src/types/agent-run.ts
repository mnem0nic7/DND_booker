import type { GenerationMode, GenerationQuality } from './generation-run.js';

export type AgentRunMode = 'background_producer' | 'persistent_editor';

export type AgentRunStatus =
  | 'queued'
  | 'seeding'
  | 'observing'
  | 'planning'
  | 'acting'
  | 'evaluating'
  | 'checkpointing'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type AgentActionType =
  | 'seed_generation'
  | 'observe_project'
  | 'create_design_profile'
  | 'create_export_review'
  | 'audit_layout_parity'
  | 'refresh_layout_plan'
  | 'expand_random_tables'
  | 'repair_stat_blocks'
  | 'densify_section_utility'
  | 'restore_checkpoint'
  | 'select_best_checkpoint'
  | 'finalize_output'
  | 'no_op';

export type AgentActionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export type AgentObservationType =
  | 'project_state'
  | 'design_profile'
  | 'export_review'
  | 'scorecard'
  | 'checkpoint'
  | 'backlog';

export type AgentDecisionType = 'cycle_plan' | 'stop' | 'checkpoint_selection' | 'rollback';

export interface AgentGoal {
  objective: string;
  successDefinition: string;
  prompt: string | null;
  targetFormat: 'pdf';
  primaryObjective: 'dm_ready_quality';
  modeIntent: AgentRunMode;
  generationMode: GenerationMode;
  generationQuality: GenerationQuality;
  pageTarget: number | null;
}

export interface AgentBudget {
  maxCycles: number;
  maxExports: number;
  maxImagePassesPerDocument: number;
  maxNoImprovementStreak: number;
  maxDurationMs: number;
}

export interface DesignReference {
  id: string;
  title: string;
  category: 'layout' | 'content' | 'art' | 'usability';
  insight: string;
  sourceLabel: string;
  sourcePath: string | null;
}

export interface DesignConstraint {
  code: string;
  title: string;
  description: string;
  severity: 'required' | 'preferred';
}

export interface DesignProfile {
  id: string;
  title: string;
  summary: string;
  references: DesignReference[];
  constraints: DesignConstraint[];
  houseStyle: {
    openerStyle: string;
    utilityBias: string;
    artPolicy: string;
    frontMatterPolicy: string;
  };
}

export interface CritiqueBacklogItem {
  id: string;
  code: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'error';
  priority: number;
  targetTitle: string | null;
  page: number | null;
}

export interface AgentScorecard {
  overallScore: number;
  exportScore: number | null;
  blockingFindingCount: number;
  warningFindingCount: number;
  utilityDensityAverage: number | null;
  sparsePageCount: number;
  thinRandomTableCount: number;
  lowUtilityDensityCount: number;
  suspiciousStatBlockCount: number;
  generatedAt: string;
  summary: string;
  latestExportJobId: string | null;
}

export interface AgentRun {
  id: string;
  projectId: string;
  userId: string;
  linkedGenerationRunId: string | null;
  mode: AgentRunMode;
  status: AgentRunStatus;
  currentStage: string | null;
  progressPercent: number;
  goal: AgentGoal;
  budget: AgentBudget;
  critiqueBacklog: CritiqueBacklogItem[];
  latestScorecard: AgentScorecard | null;
  designProfile: DesignProfile | null;
  bestCheckpointId: string | null;
  latestCheckpointId: string | null;
  currentStrategy: string | null;
  cycleCount: number;
  exportCount: number;
  noImprovementStreak: number;
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

export interface AgentRunSummary {
  id: string;
  mode: AgentRunMode;
  status: AgentRunStatus;
  currentStage: string | null;
  progressPercent: number;
  currentStrategy: string | null;
  cycleCount: number;
  exportCount: number;
  graphThreadId?: string | null;
  graphCheckpointKey?: string | null;
  graphStateJson?: Record<string, unknown> | null;
  resumeToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentCheckpoint {
  id: string;
  runId: string;
  label: string;
  summary: string | null;
  cycleIndex: number;
  isBest: boolean;
  scorecard: AgentScorecard | null;
  createdAt: string;
}

export interface AgentAction {
  id: string;
  runId: string;
  cycleIndex: number;
  actionType: AgentActionType;
  status: AgentActionStatus;
  rationale: string | null;
  input: unknown | null;
  result: unknown | null;
  scoreDelta: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AgentObservation {
  id: string;
  runId: string;
  cycleIndex: number;
  observationType: AgentObservationType;
  summary: string;
  payload: unknown | null;
  createdAt: string;
}

export interface AgentDecision {
  id: string;
  runId: string;
  cycleIndex: number;
  decisionType: AgentDecisionType;
  chosenActionType: AgentActionType | null;
  rationale: string;
  payload: unknown | null;
  createdAt: string;
}

export interface CreateAgentRunRequest {
  mode?: AgentRunMode;
  objective?: string;
  prompt?: string;
  generationMode?: GenerationMode;
  generationQuality?: GenerationQuality;
  pageTarget?: number;
  budget?: Partial<AgentBudget>;
}

export const AGENT_STATUS_TRANSITIONS: Record<AgentRunStatus, AgentRunStatus[]> = {
  queued: ['seeding', 'observing', 'cancelled', 'failed'],
  seeding: ['observing', 'paused', 'cancelled', 'failed'],
  observing: ['planning', 'paused', 'cancelled', 'failed'],
  planning: ['acting', 'evaluating', 'paused', 'cancelled', 'failed'],
  acting: ['checkpointing', 'evaluating', 'paused', 'cancelled', 'failed'],
  evaluating: ['planning', 'checkpointing', 'completed', 'paused', 'cancelled', 'failed'],
  checkpointing: ['planning', 'evaluating', 'completed', 'paused', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  paused: ['seeding', 'observing', 'planning', 'acting', 'evaluating', 'checkpointing', 'cancelled'],
  cancelled: [],
};
