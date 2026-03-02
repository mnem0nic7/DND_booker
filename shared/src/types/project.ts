import type { DocumentContent } from './document';

export type ProjectType = 'campaign' | 'one_shot' | 'supplement' | 'sourcebook';
export type ProjectStatus = 'draft' | 'in_progress' | 'review' | 'published';

export interface ProjectSettings {
  pageSize: 'letter' | 'a4' | 'a5';
  margins: { top: number; right: number; bottom: number; left: number };
  columns: 1 | 2;
  theme: string;
  fonts: { heading: string; body: string };
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  type: ProjectType;
  status: ProjectStatus;
  coverImageUrl: string | null;
  settings: ProjectSettings;
  content?: DocumentContent;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectRequest {
  title: string;
  description?: string;
  type: ProjectType;
  templateId?: string;
}
