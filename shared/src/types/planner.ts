export interface PlanTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'done' | 'blocked';
  dependsOn: string[];
  acceptanceCriteria?: string;
  notes?: string;
}

export interface MemoryItem {
  id: string;
  type: 'preference' | 'project_fact' | 'constraint' | 'decision' | 'glossary';
  content: string;
  confidence: number;
  projectId: string | null;
  source: string | null;
  createdAt: string;
}

export interface PlanningState {
  workingMemory: string[];
  taskPlan: PlanTask[];
  longTermMemory: MemoryItem[];
}

/** Control blocks the AI can embed in responses */
export interface MemoryUpdateBlock {
  _memoryUpdate: {
    add?: string[];
    drop?: number[];
  };
}

export interface PlanUpdateBlock {
  _planUpdate: {
    tasks: PlanTask[];
  };
}

export interface RememberBlock {
  _remember: {
    type: MemoryItem['type'];
    content: string;
    scope?: 'project' | 'global';
  };
}

/** A single document editing operation the AI can emit */
export interface DocumentEditOperation {
  op: 'insertBefore' | 'insertAfter' | 'remove';
  nodeIndex: number;
  node?: { type: string; attrs?: Record<string, unknown> };
}

/** Control block for AI-driven document structure edits */
export interface DocumentEditBlock {
  _documentEdit: true;
  description: string;
  operations: DocumentEditOperation[];
}

/** Result of parsing control blocks from an AI response */
export interface PlanningStateChanges {
  memoryUpdates: MemoryUpdateBlock['_memoryUpdate'][];
  planUpdates: PlanUpdateBlock['_planUpdate'][];
  remembers: RememberBlock['_remember'][];
}
