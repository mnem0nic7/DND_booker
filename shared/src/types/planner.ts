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

/** Actual rendered measurements for a single page region. */
export interface PageMetric {
  page: number;              // 1-based page number
  contentHeight: number;     // actual rendered px between boundaries
  pageHeight: number;        // --page-content-height (864 for letter)
  fillPercent: number;       // contentHeight / pageHeight * 100
  isBlank: boolean;          // < 5% fill
  isNearlyBlank: boolean;    // < 15% fill
  boundaryType: 'pageBreak' | 'autoGap' | 'end';
  nodeTypes: string[];       // first ~10 node types on this page
  firstHeading: string | null;
}

/** Snapshot of all rendered page metrics for AI evaluation. */
export interface PageMetricsSnapshot {
  totalPages: number;
  pageSize: 'letter' | 'a4' | 'a5';
  columnCount: number;
  pageContentHeight: number;
  pages: PageMetric[];
  blankPageCount: number;
  nearlyBlankPageCount: number;
}
