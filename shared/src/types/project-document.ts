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
  status: string;
  sourceArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
}
