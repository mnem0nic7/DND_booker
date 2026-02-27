export interface DocumentContent {
  type: string;
  content?: DocumentContent[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}

export interface Document {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  content: DocumentContent;
  createdAt: string;
  updatedAt: string;
}

export interface CreateDocumentRequest {
  title: string;
  content?: DocumentContent;
}
