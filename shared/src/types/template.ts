import { ProjectType } from './project.js';
import { DocumentContent } from './document.js';

export interface Template {
  id: string;
  name: string;
  description: string;
  type: ProjectType;
  content: DocumentContent;
  thumbnailUrl: string | null;
  isSystem: boolean;
  userId: string | null;
}
