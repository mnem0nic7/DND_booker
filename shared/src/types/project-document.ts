import type { LayoutPlan } from './layout-plan.js';

export type DocumentKind = 'front_matter' | 'chapter' | 'appendix' | 'back_matter';

export interface ProjectDocument {
  id: string;
  projectId: string;
  runId: string | null;
  kind: DocumentKind;
  title: string;
  slug: string;
  sortOrder: number;
  targetPageCount: number | null;
  outlineJson: unknown | null;
  layoutPlan: LayoutPlan | null;
  content: unknown;
  canonicalDocJson?: unknown | null;
  editorProjectionJson?: unknown | null;
  typstSource?: string | null;
  canonicalVersion?: number;
  editorProjectionVersion?: number;
  typstVersion?: number;
  status: string;
  sourceArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
}
