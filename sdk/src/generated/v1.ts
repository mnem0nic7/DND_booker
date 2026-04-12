import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import type {
  AgentAction,
  AgentCheckpoint,
  AgentCheckpointIdParams,
  AgentRun,
  AgentRunCreateRequest,
  AgentRunDetail,
  AgentRunIdParams,
  AgentRunSummary,
  ArtifactEvaluation,
  AssemblyManifest,
  AuthLoginRequest,
  AuthLogoutResponse,
  AuthRegisterRequest,
  AuthSessionResponse,
  CanonEntity,
  CreateImprovementLoopAndProjectRequest,
  CreateImprovementLoopRequest,
  DocumentIdParams,
  DocumentLayout,
  ExportJob,
  ExportJobIdParams,
  ExportRequest,
  ExportReviewFixResult,
  GeneratedArtifact,
  GenerationArtifactIdParams,
  GenerationRun,
  GenerationRunCreateRequest,
  GenerationRunDetail,
  GenerationRunIdParams,
  GraphInterrupt,
  GraphInterruptIdParams,
  GraphInterruptResolutionRequestBody,
  ImprovementLoopArtifact,
  ImprovementLoopDefaultEngineeringTarget,
  ImprovementLoopRun,
  ImprovementLoopRunDetail,
  ImprovementLoopRunIdParams,
  ImprovementLoopRunSummary,
  ImprovementLoopWorkspaceRunSummary,
  Problem,
  ProjectCreateRequest,
  ProjectDetail,
  ProjectGitHubRepoBinding,
  ProjectGitHubRepoBindingInput,
  ProjectGitHubRepoBindingValidation,
  ProjectIdParams,
  ProjectSummary,
  ProjectUpdateRequest,
  PublicationDocumentDetail,
  PublicationDocumentPatchRequest,
  PublicationDocumentSummary,
  PublicationDocumentTypst,
  V1GenerationTask
} from '@dnd-booker/shared';

function buildPath(template: string, params?: Record<string, string | number | undefined>) {
  if (!params) return template;
  return Object.entries(params).reduce((path, [key, value]) => path.replace(`{${key}}`, encodeURIComponent(String(value))), template);
}

export interface V1Client {
  auth: {
    login(body: AuthLoginRequest, config?: AxiosRequestConfig): Promise<AuthSessionResponse>;
    register(body: AuthRegisterRequest, config?: AxiosRequestConfig): Promise<AuthSessionResponse>;
    refresh(config?: AxiosRequestConfig): Promise<AuthSessionResponse>;
    logout(config?: AxiosRequestConfig): Promise<AuthLogoutResponse>;
  };
  projects: {
    listProjects(config?: AxiosRequestConfig): Promise<ProjectSummary[]>;
    createProject(body: ProjectCreateRequest, config?: AxiosRequestConfig): Promise<ProjectSummary>;
    getProject(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<ProjectDetail>;
    getProjectGitHubRepoBinding(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<ProjectGitHubRepoBinding>;
    upsertProjectGitHubRepoBinding(params: ProjectIdParams, body: ProjectGitHubRepoBindingInput, config?: AxiosRequestConfig): Promise<ProjectGitHubRepoBinding>;
    validateProjectGitHubRepoBinding(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<ProjectGitHubRepoBindingValidation>;
    updateProject(params: ProjectIdParams, body: ProjectUpdateRequest, config?: AxiosRequestConfig): Promise<ProjectDetail>;
    deleteProject(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<void>;
  };
  documents: {
    listDocuments(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentSummary[]>;
    getDocument(params: DocumentIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail>;
    getDocumentCanonical(params: DocumentIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail["canonicalDocJson"]>;
    getDocumentEditorProjection(params: DocumentIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail["editorProjectionJson"]>;
    getDocumentTypst(params: DocumentIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentTypst>;
    updateDocument(params: DocumentIdParams, body: PublicationDocumentPatchRequest, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail>;
    updateDocumentLayout(params: DocumentIdParams, body: DocumentLayout, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail>;
  };
  graphInterrupts: {
    listProjectInterrupts(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<GraphInterrupt[]>;
  };
  generationRuns: {
    createGenerationRun(params: ProjectIdParams, body: GenerationRunCreateRequest, config?: AxiosRequestConfig): Promise<GenerationRun>;
    listGenerationRuns(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<GenerationRun[]>;
    getGenerationRun(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<GenerationRunDetail>;
    pauseGenerationRun(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<GenerationRun>;
    resumeGenerationRun(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<GenerationRun>;
    cancelGenerationRun(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<GenerationRun>;
    listGenerationRunInterrupts(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<GraphInterrupt[]>;
    resolveGenerationRunInterrupt(params: GraphInterruptIdParams, body: GraphInterruptResolutionRequestBody, config?: AxiosRequestConfig): Promise<GraphInterrupt>;
    listGenerationTasks(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<V1GenerationTask[]>;
    listGenerationArtifacts(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<GeneratedArtifact[]>;
    getGenerationArtifact(params: GenerationArtifactIdParams, config?: AxiosRequestConfig): Promise<GeneratedArtifact & { evaluations?: ArtifactEvaluation[] }>;
    listGenerationCanonEntities(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<CanonEntity[]>;
    listGenerationEvaluations(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<ArtifactEvaluation[]>;
    getGenerationAssemblyManifest(params: GenerationRunIdParams, config?: AxiosRequestConfig): Promise<AssemblyManifest>;
  };
  agentRuns: {
    createAgentRun(params: ProjectIdParams, body: AgentRunCreateRequest, config?: AxiosRequestConfig): Promise<AgentRun>;
    listAgentRuns(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<AgentRunSummary[]>;
    getAgentRun(params: AgentRunIdParams, config?: AxiosRequestConfig): Promise<AgentRunDetail>;
    pauseAgentRun(params: AgentRunIdParams, config?: AxiosRequestConfig): Promise<AgentRun>;
    resumeAgentRun(params: AgentRunIdParams, config?: AxiosRequestConfig): Promise<AgentRun>;
    cancelAgentRun(params: AgentRunIdParams, config?: AxiosRequestConfig): Promise<AgentRun>;
    listAgentRunInterrupts(params: AgentRunIdParams, config?: AxiosRequestConfig): Promise<GraphInterrupt[]>;
    resolveAgentRunInterrupt(params: GraphInterruptIdParams, body: GraphInterruptResolutionRequestBody, config?: AxiosRequestConfig): Promise<GraphInterrupt>;
    listAgentCheckpoints(params: AgentRunIdParams, config?: AxiosRequestConfig): Promise<AgentCheckpoint[]>;
    restoreAgentCheckpoint(params: AgentCheckpointIdParams, config?: AxiosRequestConfig): Promise<AgentCheckpoint>;
    listAgentActions(params: AgentRunIdParams, config?: AxiosRequestConfig): Promise<AgentAction[]>;
  };
  improvementLoops: {
    getDefaultImprovementLoopEngineeringTarget(config?: AxiosRequestConfig): Promise<ImprovementLoopDefaultEngineeringTarget>;
    listRecentImprovementLoops(config?: AxiosRequestConfig): Promise<ImprovementLoopWorkspaceRunSummary[]>;
    createImprovementLoopAndProject(body: CreateImprovementLoopAndProjectRequest, config?: AxiosRequestConfig): Promise<ImprovementLoopRun>;
    createImprovementLoop(params: ProjectIdParams, body: CreateImprovementLoopRequest, config?: AxiosRequestConfig): Promise<ImprovementLoopRun>;
    listImprovementLoops(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<ImprovementLoopRunSummary[]>;
    getImprovementLoop(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig): Promise<ImprovementLoopRunDetail>;
    pauseImprovementLoop(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig): Promise<ImprovementLoopRun>;
    resumeImprovementLoop(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig): Promise<ImprovementLoopRun>;
    cancelImprovementLoop(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig): Promise<ImprovementLoopRun>;
    listImprovementLoopArtifacts(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig): Promise<ImprovementLoopArtifact[]>;
    getImprovementLoopArtifact(params: ImprovementLoopRunIdParams & { artifactId: string }, config?: AxiosRequestConfig): Promise<ImprovementLoopArtifact>;
  };
  exports: {
    createExportJob(params: ProjectIdParams, body: ExportRequest, config?: AxiosRequestConfig): Promise<ExportJob>;
    listExportJobs(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<ExportJob[]>;
    getExportJob(params: ExportJobIdParams, config?: AxiosRequestConfig): Promise<ExportJob>;
    applyExportJobFixes(params: ExportJobIdParams, config?: AxiosRequestConfig): Promise<ExportReviewFixResult>;
    downloadExportJob(params: ExportJobIdParams, config?: AxiosRequestConfig): Promise<Blob>;
  };
}

export function createV1Client(axios: AxiosInstance): V1Client {
  return {
    auth: {
      async login(body: AuthLoginRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.post<AuthSessionResponse>('/v1/auth/login', body, config);
        return data;
      },
      async register(body: AuthRegisterRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.post<AuthSessionResponse>('/v1/auth/register', body, config);
        return data;
      },
      async refresh(config?: AxiosRequestConfig) {
        const { data } = await axios.post<AuthSessionResponse>('/v1/auth/refresh', undefined, config);
        return data;
      },
      async logout(config?: AxiosRequestConfig) {
        const { data } = await axios.post<AuthLogoutResponse>('/v1/auth/logout', undefined, config);
        return data;
      },
    },
    projects: {
      async listProjects(config?: AxiosRequestConfig) {
        const { data } = await axios.get<ProjectSummary[]>('/v1/projects', config);
        return data;
      },
      async createProject(body: ProjectCreateRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ProjectSummary>('/v1/projects', body, config);
        return data;
      },
      async getProject(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ProjectDetail>(buildPath('/v1/projects/{projectId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getProjectGitHubRepoBinding(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ProjectGitHubRepoBinding>(buildPath('/v1/projects/{projectId}/github-repo-binding', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async upsertProjectGitHubRepoBinding(params: ProjectIdParams, body: ProjectGitHubRepoBindingInput, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ProjectGitHubRepoBinding>(buildPath('/v1/projects/{projectId}/github-repo-binding', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async validateProjectGitHubRepoBinding(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ProjectGitHubRepoBindingValidation>(buildPath('/v1/projects/{projectId}/github-repo-binding/validate', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async updateProject(params: ProjectIdParams, body: ProjectUpdateRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.patch<ProjectDetail>(buildPath('/v1/projects/{projectId}', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async deleteProject(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.delete<void>(buildPath('/v1/projects/{projectId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
    },
    documents: {
      async listDocuments(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<PublicationDocumentSummary[]>(buildPath('/v1/projects/{projectId}/documents', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getDocument(params: DocumentIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<PublicationDocumentDetail>(buildPath('/v1/projects/{projectId}/documents/{docId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getDocumentCanonical(params: DocumentIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<PublicationDocumentDetail["canonicalDocJson"]>(buildPath('/v1/projects/{projectId}/documents/{docId}/canonical', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getDocumentEditorProjection(params: DocumentIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<PublicationDocumentDetail["editorProjectionJson"]>(buildPath('/v1/projects/{projectId}/documents/{docId}/editor-projection', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getDocumentTypst(params: DocumentIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<PublicationDocumentTypst>(buildPath('/v1/projects/{projectId}/documents/{docId}/typst', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async updateDocument(params: DocumentIdParams, body: PublicationDocumentPatchRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.patch<PublicationDocumentDetail>(buildPath('/v1/projects/{projectId}/documents/{docId}', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async updateDocumentLayout(params: DocumentIdParams, body: DocumentLayout, config?: AxiosRequestConfig) {
        const { data } = await axios.patch<PublicationDocumentDetail>(buildPath('/v1/projects/{projectId}/documents/{docId}/layout', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
    },
    graphInterrupts: {
      async listProjectInterrupts(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<GraphInterrupt[]>(buildPath('/v1/projects/{projectId}/interrupts', params as Record<string, string | number | undefined>), config);
        return data;
      },
    },
    generationRuns: {
      async createGenerationRun(params: ProjectIdParams, body: GenerationRunCreateRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.post<GenerationRun>(buildPath('/v1/projects/{projectId}/generation-runs', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async listGenerationRuns(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<GenerationRun[]>(buildPath('/v1/projects/{projectId}/generation-runs', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getGenerationRun(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<GenerationRunDetail>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async pauseGenerationRun(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<GenerationRun>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/pause', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async resumeGenerationRun(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<GenerationRun>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/resume', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async cancelGenerationRun(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<GenerationRun>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/cancel', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async listGenerationRunInterrupts(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<GraphInterrupt[]>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/interrupts', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async resolveGenerationRunInterrupt(params: GraphInterruptIdParams, body: GraphInterruptResolutionRequestBody, config?: AxiosRequestConfig) {
        const { data } = await axios.post<GraphInterrupt>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/interrupts/{interruptId}/resolve', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async listGenerationTasks(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<V1GenerationTask[]>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/tasks', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async listGenerationArtifacts(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<GeneratedArtifact[]>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/artifacts', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getGenerationArtifact(params: GenerationArtifactIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<GeneratedArtifact & { evaluations?: ArtifactEvaluation[] }>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/artifacts/{artifactId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async listGenerationCanonEntities(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<CanonEntity[]>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/canon', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async listGenerationEvaluations(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ArtifactEvaluation[]>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/evaluations', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getGenerationAssemblyManifest(params: GenerationRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<AssemblyManifest>(buildPath('/v1/projects/{projectId}/generation-runs/{runId}/assembly', params as Record<string, string | number | undefined>), config);
        return data;
      },
    },
    agentRuns: {
      async createAgentRun(params: ProjectIdParams, body: AgentRunCreateRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.post<AgentRun>(buildPath('/v1/projects/{projectId}/agent-runs', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async listAgentRuns(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<AgentRunSummary[]>(buildPath('/v1/projects/{projectId}/agent-runs', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getAgentRun(params: AgentRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<AgentRunDetail>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async pauseAgentRun(params: AgentRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<AgentRun>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}/pause', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async resumeAgentRun(params: AgentRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<AgentRun>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}/resume', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async cancelAgentRun(params: AgentRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<AgentRun>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}/cancel', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async listAgentRunInterrupts(params: AgentRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<GraphInterrupt[]>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}/interrupts', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async resolveAgentRunInterrupt(params: GraphInterruptIdParams, body: GraphInterruptResolutionRequestBody, config?: AxiosRequestConfig) {
        const { data } = await axios.post<GraphInterrupt>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}/interrupts/{interruptId}/resolve', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async listAgentCheckpoints(params: AgentRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<AgentCheckpoint[]>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}/checkpoints', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async restoreAgentCheckpoint(params: AgentCheckpointIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<AgentCheckpoint>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}/checkpoints/{checkpointId}/restore', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async listAgentActions(params: AgentRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<AgentAction[]>(buildPath('/v1/projects/{projectId}/agent-runs/{runId}/actions', params as Record<string, string | number | undefined>), config);
        return data;
      },
    },
    improvementLoops: {
      async getDefaultImprovementLoopEngineeringTarget(config?: AxiosRequestConfig) {
        const { data } = await axios.get<ImprovementLoopDefaultEngineeringTarget>('/v1/improvement-loops/default-engineering-target', config);
        return data;
      },
      async listRecentImprovementLoops(config?: AxiosRequestConfig) {
        const { data } = await axios.get<ImprovementLoopWorkspaceRunSummary[]>('/v1/improvement-loops/recent', config);
        return data;
      },
      async createImprovementLoopAndProject(body: CreateImprovementLoopAndProjectRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ImprovementLoopRun>('/v1/improvement-loops', body, config);
        return data;
      },
      async createImprovementLoop(params: ProjectIdParams, body: CreateImprovementLoopRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ImprovementLoopRun>(buildPath('/v1/projects/{projectId}/improvement-loops', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async listImprovementLoops(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ImprovementLoopRunSummary[]>(buildPath('/v1/projects/{projectId}/improvement-loops', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getImprovementLoop(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ImprovementLoopRunDetail>(buildPath('/v1/projects/{projectId}/improvement-loops/{runId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async pauseImprovementLoop(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ImprovementLoopRun>(buildPath('/v1/projects/{projectId}/improvement-loops/{runId}/pause', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async resumeImprovementLoop(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ImprovementLoopRun>(buildPath('/v1/projects/{projectId}/improvement-loops/{runId}/resume', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async cancelImprovementLoop(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ImprovementLoopRun>(buildPath('/v1/projects/{projectId}/improvement-loops/{runId}/cancel', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async listImprovementLoopArtifacts(params: ImprovementLoopRunIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ImprovementLoopArtifact[]>(buildPath('/v1/projects/{projectId}/improvement-loops/{runId}/artifacts', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getImprovementLoopArtifact(params: ImprovementLoopRunIdParams & { artifactId: string }, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ImprovementLoopArtifact>(buildPath('/v1/projects/{projectId}/improvement-loops/{runId}/artifacts/{artifactId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
    },
    exports: {
      async createExportJob(params: ProjectIdParams, body: ExportRequest, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ExportJob>(buildPath('/v1/projects/{projectId}/export-jobs', params as Record<string, string | number | undefined>), body, config);
        return data;
      },
      async listExportJobs(params: ProjectIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ExportJob[]>(buildPath('/v1/projects/{projectId}/export-jobs', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async getExportJob(params: ExportJobIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<ExportJob>(buildPath('/v1/export-jobs/{jobId}', params as Record<string, string | number | undefined>), config);
        return data;
      },
      async applyExportJobFixes(params: ExportJobIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.post<ExportReviewFixResult>(buildPath('/v1/export-jobs/{jobId}/fix', params as Record<string, string | number | undefined>), undefined, config);
        return data;
      },
      async downloadExportJob(params: ExportJobIdParams, config?: AxiosRequestConfig) {
        const { data } = await axios.get<Blob>(buildPath('/v1/export-jobs/{jobId}/download', params as Record<string, string | number | undefined>), { ...(config ?? {}), responseType: 'blob' });
        return data;
      },
    },
  };
}

export type { Problem };
