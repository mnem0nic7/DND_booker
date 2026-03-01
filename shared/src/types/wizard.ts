export type WizardPhase = 'questionnaire' | 'outline' | 'generating' | 'review' | 'done';

export interface WizardQuestion {
  id: string;
  question: string;
  options?: string[];       // suggested choices (user can also type free-form)
}

export interface WizardParameters {
  projectType: string;
  answers: Record<string, string>;  // questionId → answer text
}

export interface WizardOutlineSection {
  id: string;
  title: string;
  description: string;     // what this section covers
  blockHints: string[];    // suggested block types: statBlock, readAloudBox, etc.
  sortOrder: number;
}

export interface WizardOutline {
  adventureTitle: string;
  summary: string;
  sections: WizardOutlineSection[];
}

export type WizardSectionStatus = 'pending' | 'generating' | 'completed' | 'failed';

export interface WizardGeneratedSection {
  sectionId: string;       // matches WizardOutlineSection.id
  title: string;
  status: WizardSectionStatus;
  content: unknown;        // TipTap JSON (DocumentContent)
  markdown?: string;       // raw AI markdown (for debugging / re-generation)
  error?: string;
}

export interface WizardSession {
  id: string;
  projectId: string;
  userId: string;
  phase: WizardPhase;
  parameters: WizardParameters | null;
  outline: WizardOutline | null;
  sections: WizardGeneratedSection[];
  progress: number;        // 0-100 overall completion percentage
  errorMsg: string | null;
  createdAt: string;
  updatedAt: string;
}

/** SSE events sent during wizard streaming */
export type WizardEvent =
  | { type: 'phase'; phase: WizardPhase }
  | { type: 'questions'; questions: WizardQuestion[] }
  | { type: 'outline'; outline: WizardOutline }
  | { type: 'section_start'; sectionId: string; title: string }
  | { type: 'section_chunk'; sectionId: string; chunk: string }
  | { type: 'section_done'; sectionId: string }
  | { type: 'section_error'; sectionId: string; error: string }
  | { type: 'progress'; percent: number }
  | { type: 'done' }
  | { type: 'error'; error: string };
