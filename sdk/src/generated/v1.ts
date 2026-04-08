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
  DocumentIdParams,
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
  Problem,
  ProjectIdParams,
  PublicationDocumentDetail,
  PublicationDocumentPatchRequest,
  PublicationDocumentSummary,
  PublicationDocumentTypst
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
  documents: {
    listDocuments(params: ProjectIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentSummary[]>;
    getDocument(params: DocumentIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail>;
    getDocumentCanonical(params: DocumentIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail["canonicalDocJson"]>;
    getDocumentEditorProjection(params: DocumentIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail["editorProjectionJson"]>;
    getDocumentTypst(params: DocumentIdParams, config?: AxiosRequestConfig): Promise<PublicationDocumentTypst>;
    updateDocument(params: DocumentIdParams, body: PublicationDocumentPatchRequest, config?: AxiosRequestConfig): Promise<PublicationDocumentDetail>;
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
