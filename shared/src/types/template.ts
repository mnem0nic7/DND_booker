import { ProjectType } from './project';
import { DocumentContent } from './document';

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
