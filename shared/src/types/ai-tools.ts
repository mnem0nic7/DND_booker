/** Context passed to every tool execution. */
export interface ToolContext {
  userId: string;
  projectId: string;
  requestId: string;
}

/** Standardized result from every tool execution. */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: {
    code: 'FORBIDDEN' | 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_ERROR';
    message: string;
  };
}

/** Where a tool is available. */
export type ToolScope = 'project-chat' | 'global';

/** Audit entry written per tool call. */
export interface ToolAuditEntry {
  requestId: string;
  userId: string;
  projectId: string | null;
  toolName: string;
  inputHash: string;
  resultStatus: string;
  oldContentHash?: string;
  newContentHash?: string;
  oldUpdatedAt?: string;
  newUpdatedAt?: string;
  latencyMs: number;
}

/** Events the client receives from the UI Message Stream. */
export type ToolCallStatus = 'running' | 'complete' | 'error';

export interface ActiveToolCall {
  toolCallId: string;
  toolName: string;
  status: ToolCallStatus;
  result?: unknown;
  error?: string;
}
