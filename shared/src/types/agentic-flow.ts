import type { GenerationMode } from './generation-run.js';

export type QualityBudgetLane = 'fast' | 'balanced' | 'high_quality';

export type AgentStage =
  | 'interview_locked'
  | 'writer_story_packet'
  | 'dnd_expert_inserts'
  | 'layout_first_draft'
  | 'artist_requested'
  | 'critic_text_pass'
  | 'rewrite_writer'
  | 'rewrite_dnd_expert'
  | 'rewrite_layout'
  | 'artist_completed'
  | 'critic_image_pass'
  | 'final_editor'
  | 'printer'
  | 'completed'
  | 'failed';

export interface InterviewTurn {
  id: string;
  role: 'assistant' | 'user';
  content: string;
  createdAt: string;
}

export interface InterviewBrief {
  title: string;
  summary: string;
  generationMode: Extract<GenerationMode, 'one_shot' | 'module'>;
  concept: string;
  theme: string;
  tone: string;
  levelRange: {
    min: number;
    max: number;
  } | null;
  scope: string;
  partyAssumptions: string;
  desiredComplexity: string;
  qualityBudgetLane: QualityBudgetLane;
  mustHaveElements: string[];
  specialConstraints: string[];
  settings: {
    includeHandouts: boolean;
    includeMaps: boolean;
    strict5e: boolean;
  };
}

export interface InterviewSession {
  id: string;
  projectId: string;
  userId: string;
  status: 'collecting' | 'ready_to_lock' | 'locked';
  turns: InterviewTurn[];
  briefDraft: InterviewBrief | null;
  lockedBrief: InterviewBrief | null;
  missingFields: string[];
  maxUserTurns: number;
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
}

export interface WriterStoryPacket {
  title: string;
  summary: string;
  outline: unknown;
  plotHooks: string[];
  cast: Array<{
    slug: string;
    role: string;
    name: string;
    summary: string;
  }>;
  coreLocations: Array<{
    slug: string;
    name: string;
    summary: string;
  }>;
  encounterCadence: Array<{
    chapterSlug: string;
    sectionCount: number;
    encounterSectionCount: number;
  }>;
  chapterSummaries: Array<{
    slug: string;
    title: string;
    summary: string;
  }>;
  continuityAnchors: string[];
}

export interface InsertArtifactEnvelope {
  artifactType: string;
  artifactKey: string;
  title: string;
  owner: 'dnd_expert';
  chapterSlug: string | null;
  payload: unknown;
}

export interface ImageBrief {
  documentSlug: string;
  blockType: string;
  nodeIndex: number;
  prompt: string;
  rationale: string;
  model: string;
  size: string;
}

export interface LayoutDraft {
  documentCount: number;
  documents: Array<{
    documentId: string;
    slug: string;
    title: string;
    kind: string;
    layoutArtifactKey: string | null;
    imageSlotCount: number;
  }>;
  imageBriefs: ImageBrief[];
}

export interface CriticReport {
  cycle: number;
  stage: Extract<AgentStage, 'critic_text_pass' | 'critic_image_pass'>;
  passed: boolean;
  overallScore: number;
  blockingFindingCount: number;
  majorFindingCount: number;
  findings: Array<{
    artifactId: string | null;
    artifactKey: string;
    artifactType: string;
    owner: 'writer' | 'dnd_expert' | 'layout_expert' | 'artist';
    severity: 'critical' | 'major' | 'minor' | 'informational';
    code: string;
    message: string;
  }>;
  routedRewriteCounts: {
    writer: number;
    dndExpert: number;
    layoutExpert: number;
    artist: number;
  };
}

export interface EditorialDecision {
  approved: boolean;
  summary: string;
  targetedRewriteOwner: 'writer' | 'dnd_expert' | 'layout_expert' | 'artist' | null;
  notes: string[];
}

export interface PrintManifest {
  exportFormat: 'print_pdf';
  sourceManifestId: string | null;
  documentCount: number;
  latestCriticReportId: string | null;
  editorReportId: string | null;
}

export interface CriticCycleState {
  cycle: number;
  latestCriticReportId: string | null;
  latestEditorReportId: string | null;
  routedRewriteCounts: {
    writer: number;
    dndExpert: number;
    layoutExpert: number;
    artist: number;
  };
  stalled: boolean;
}
