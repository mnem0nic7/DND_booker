export type ArtifactStatus =
  | 'queued'
  | 'generating'
  | 'generated'
  | 'evaluating'
  | 'passed'
  | 'failed_evaluation'
  | 'revising'
  | 'accepted'
  | 'rejected'
  | 'assembled';

export type ArtifactCategory = 'planning' | 'reference' | 'written' | 'evaluation' | 'assembly';

export type ArtifactType =
  | 'project_profile'
  | 'campaign_bible'
  | 'chapter_outline'
  | 'chapter_plan'
  | 'section_spec'
  | 'appendix_plan'
  | 'npc_dossier'
  | 'location_brief'
  | 'faction_profile'
  | 'quest_arc'
  | 'item_bundle'
  | 'monster_bundle'
  | 'encounter_bundle'
  | 'chapter_draft'
  | 'section_draft'
  | 'appendix_draft'
  | 'front_matter_draft'
  | 'back_matter_draft'
  | 'sidebar_bundle'
  | 'read_aloud_bundle'
  | 'handout_bundle'
  | 'artifact_evaluation'
  | 'continuity_report'
  | 'preflight_report'
  | 'assembly_manifest';

export const ARTIFACT_CATEGORY_MAP: Record<ArtifactType, ArtifactCategory> = {
  project_profile: 'planning',
  campaign_bible: 'planning',
  chapter_outline: 'planning',
  chapter_plan: 'planning',
  section_spec: 'planning',
  appendix_plan: 'planning',
  npc_dossier: 'reference',
  location_brief: 'reference',
  faction_profile: 'reference',
  quest_arc: 'reference',
  item_bundle: 'reference',
  monster_bundle: 'reference',
  encounter_bundle: 'reference',
  chapter_draft: 'written',
  section_draft: 'written',
  appendix_draft: 'written',
  front_matter_draft: 'written',
  back_matter_draft: 'written',
  sidebar_bundle: 'written',
  read_aloud_bundle: 'written',
  handout_bundle: 'written',
  artifact_evaluation: 'evaluation',
  continuity_report: 'evaluation',
  preflight_report: 'evaluation',
  assembly_manifest: 'assembly',
};

export interface GeneratedArtifact {
  id: string;
  runId: string;
  projectId: string;
  sourceTaskId: string | null;
  artifactType: ArtifactType;
  artifactKey: string;
  parentArtifactId: string | null;
  status: ArtifactStatus;
  version: number;
  title: string;
  summary: string | null;
  jsonContent: unknown | null;
  markdownContent: string | null;
  tiptapContent: unknown | null;
  metadata: unknown | null;
  pageEstimate: number | null;
  tokenCount: number | null;
  createdAt: string;
  updatedAt: string;
}
