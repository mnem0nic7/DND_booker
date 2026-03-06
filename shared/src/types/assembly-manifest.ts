export interface AssemblyDocumentSpec {
  documentSlug: string;
  title: string;
  kind: 'front_matter' | 'chapter' | 'appendix' | 'back_matter';
  artifactKeys: string[];
  sortOrder: number;
  targetPageCount?: number;
}

export interface AssemblyManifest {
  id: string;
  runId: string;
  projectId: string;
  version: number;
  documents: AssemblyDocumentSpec[];
  assemblyRules: unknown | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
