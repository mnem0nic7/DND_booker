export interface DocumentContent {
  type: string;
  content?: DocumentContent[];
  attrs?: Record<string, unknown>;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
}
