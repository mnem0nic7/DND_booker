import type { AgentRunMode, AgentScorecard, CritiqueBacklogItem } from './agent-run.js';
import type { GenerationMode, GenerationQuality } from './generation-run.js';

export type ImprovementLoopRunMode = 'current_project' | 'create_campaign';

export type ImprovementLoopRunStatus =
  | 'queued'
  | 'bootstrapping_project'
  | 'creator'
  | 'designer'
  | 'editor'
  | 'engineering'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type ImprovementLoopArtifactType =
  | 'creator_report'
  | 'designer_ux_notes'
  | 'editor_final_report'
  | 'engineering_report'
  | 'engineering_apply_result';

export type ImprovementLoopArtifactStatus = 'generated' | 'accepted' | 'failed';

export type RepoBindingValidationStatus = 'unconfigured' | 'invalid' | 'valid';
export type ImprovementLoopRole = 'creator' | 'designer' | 'editor' | 'engineer';
export type ImprovementLoopRoleRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped';

export interface ProjectGitHubRepoBinding {
  id: string;
  projectId: string;
  repositoryFullName: string;
  installationId: number;
  defaultBranch: string;
  pathAllowlist: string[];
  engineeringAutomationEnabled: boolean;
  lastValidatedAt: string | null;
  lastValidationStatus: RepoBindingValidationStatus;
  lastValidationMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectGitHubRepoBindingInput {
  repositoryFullName: string;
  installationId: number;
  defaultBranch: string;
  pathAllowlist?: string[];
  engineeringAutomationEnabled?: boolean;
}

export interface ProjectGitHubRepoBindingValidation {
  status: RepoBindingValidationStatus;
  message: string;
  repositoryFullName: string | null;
  defaultBranch: string | null;
  checkedAt: string;
}

export interface ImprovementLoopDefaultEngineeringTarget {
  repositoryFullName: string;
  installationId: number;
  defaultBranch: string;
  pathAllowlist: string[];
  engineeringAutomationEnabled: boolean;
  engineeringAutomationAvailable: boolean;
  source: 'env' | 'fallback';
  message: string;
}

export interface ImprovementLoopInput {
  mode: ImprovementLoopRunMode;
  prompt: string | null;
  objective: string;
  projectTitle: string | null;
  generationMode: GenerationMode;
  generationQuality: GenerationQuality;
  agentMode: AgentRunMode;
}

export interface CreatorReport {
  mode: 'generated_campaign' | 'synthesized_existing_project';
  summary: string;
  prompt: string | null;
  substantialContentDetected: boolean;
  linkedGenerationRunId: string | null;
  notes: string[];
}

export interface DesignerUxNotes {
  summary: string;
  observations: string[];
  frictionPoints: string[];
  recommendations: string[];
}

export interface EditorFinalReport {
  overallScore: number;
  recommendation: 'ready' | 'needs_revision' | 'blocked';
  summary: string;
  strengths: string[];
  issues: string[];
  latestScorecard: AgentScorecard | null;
  critiqueBacklog: CritiqueBacklogItem[];
}

export interface EngineeringImprovement {
  id: string;
  title: string;
  priority: 'high' | 'medium' | 'low';
  rationale: string;
  affectedPaths: string[];
  proposedChanges: string[];
  autoApplyEligible: boolean;
  deferredReason: string | null;
}

export interface EngineeringReport {
  summary: string;
  repoObservations: string[];
  improvements: EngineeringImprovement[];
  appliedCount: number;
  deferredCount: number;
}

export interface EngineeringApplyResult {
  status: 'applied' | 'partial' | 'skipped' | 'failed';
  message: string;
  branchName: string | null;
  baseBranch: string | null;
  headSha: string | null;
  pullRequestNumber: number | null;
  pullRequestUrl: string | null;
  appliedPaths: string[];
  deferredPaths: string[];
}

export interface ImprovementLoopRoleRun {
  id: string;
  runId: string;
  projectId: string;
  userId: string;
  role: ImprovementLoopRole;
  status: ImprovementLoopRoleRunStatus;
  objective: string;
  input: Record<string, unknown> | null;
  linkedGenerationRunId: string | null;
  linkedAgentRunId: string | null;
  outputArtifactIds: string[];
  summary: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface ImprovementLoopArtifact {
  id: string;
  runId: string;
  projectId: string;
  artifactType: ImprovementLoopArtifactType;
  artifactKey: string;
  status: ImprovementLoopArtifactStatus;
  version: number;
  title: string;
  summary: string | null;
  jsonContent: unknown | null;
  markdownContent: string | null;
  metadata: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImprovementLoopRun {
  id: string;
  projectId: string;
  userId: string;
  mode: ImprovementLoopRunMode;
  status: ImprovementLoopRunStatus;
  currentStage: string | null;
  progressPercent: number;
  input: ImprovementLoopInput;
  roles: ImprovementLoopRoleRun[];
  linkedGenerationRunId: string | null;
  linkedAgentRunId: string | null;
  creatorReport: CreatorReport | null;
  designerUxNotes: DesignerUxNotes | null;
  editorFinalReport: EditorFinalReport | null;
  engineeringReport: EngineeringReport | null;
  engineeringApplyResult: EngineeringApplyResult | null;
  githubBranchName: string | null;
  githubBaseBranch: string | null;
  githubHeadSha: string | null;
  githubPullRequestNumber: number | null;
  githubPullRequestUrl: string | null;
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

export interface ImprovementLoopRunSummary {
  id: string;
  projectId: string;
  mode: ImprovementLoopRunMode;
  status: ImprovementLoopRunStatus;
  currentStage: string | null;
  progressPercent: number;
  roles: ImprovementLoopRoleRun[];
  linkedGenerationRunId: string | null;
  linkedAgentRunId: string | null;
  githubPullRequestNumber: number | null;
  githubPullRequestUrl: string | null;
  failureReason: string | null;
  graphThreadId?: string | null;
  graphCheckpointKey?: string | null;
  graphStateJson?: Record<string, unknown> | null;
  resumeToken?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImprovementLoopWorkspaceRunSummary {
  runId: string;
  projectId: string;
  projectTitle: string;
  mode: ImprovementLoopRunMode;
  status: ImprovementLoopRunStatus;
  currentStage: string | null;
  progressPercent: number;
  roles: ImprovementLoopRoleRun[];
  linkedGenerationRunId: string | null;
  linkedAgentRunId: string | null;
  editorRecommendation: EditorFinalReport['recommendation'] | null;
  editorScore: number | null;
  githubPullRequestNumber: number | null;
  githubPullRequestUrl: string | null;
  artifactCount: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateImprovementLoopRequest {
  prompt?: string;
  objective?: string;
  generationMode?: GenerationMode;
  generationQuality?: GenerationQuality;
}

export interface CreateImprovementLoopAndProjectRequest extends CreateImprovementLoopRequest {
  projectTitle: string;
  repoBinding: ProjectGitHubRepoBindingInput;
}

export const IMPROVEMENT_LOOP_STATUS_TRANSITIONS: Record<ImprovementLoopRunStatus, ImprovementLoopRunStatus[]> = {
  queued: ['bootstrapping_project', 'creator', 'cancelled', 'failed'],
  bootstrapping_project: ['creator', 'paused', 'cancelled', 'failed'],
  creator: ['designer', 'paused', 'cancelled', 'failed'],
  designer: ['editor', 'paused', 'cancelled', 'failed'],
  editor: ['engineering', 'paused', 'cancelled', 'failed'],
  engineering: ['completed', 'paused', 'cancelled', 'failed'],
  completed: [],
  failed: [],
  paused: ['bootstrapping_project', 'creator', 'designer', 'editor', 'engineering', 'cancelled'],
  cancelled: [],
};
