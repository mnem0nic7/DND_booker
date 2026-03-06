export type CanonEntityType =
  | 'npc'
  | 'location'
  | 'faction'
  | 'item'
  | 'quest'
  | 'monster'
  | 'encounter';

export type CanonReferenceType =
  | 'introduces'
  | 'mentions'
  | 'resolves'
  | 'depends_on';

export interface CanonEntity {
  id: string;
  projectId: string;
  runId: string;
  entityType: CanonEntityType;
  slug: string;
  canonicalName: string;
  aliases: string[];
  canonicalData: unknown;
  summary: string;
  sourceArtifactId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanonReference {
  id: string;
  entityId: string;
  artifactId: string;
  referenceType: CanonReferenceType;
  metadata: unknown | null;
}
