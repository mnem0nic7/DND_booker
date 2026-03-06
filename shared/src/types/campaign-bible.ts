export interface CampaignBible {
  id: string;
  runId: string;
  projectId: string;
  version: number;
  title: string;
  summary: string;
  premise: string | null;
  worldRules: unknown | null;
  actStructure: unknown | null;
  timeline: unknown | null;
  levelProgression: unknown | null;
  pageBudget: unknown | null;
  styleGuide: unknown | null;
  openThreads: unknown | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
