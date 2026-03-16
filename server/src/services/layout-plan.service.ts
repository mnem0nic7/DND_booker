import type { DocumentContent, LayoutPlan } from '@dnd-booker/shared';
import { ensureStableNodeIds, resolveLayoutPlan } from '@dnd-booker/shared';

interface ResolveDocumentLayoutInput {
  content: unknown;
  layoutPlan?: unknown;
  kind?: string | null;
  title?: string | null;
}

export interface ResolvedDocumentLayout {
  content: DocumentContent;
  layoutPlan: LayoutPlan;
}

function asDocumentContent(value: unknown): DocumentContent {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as DocumentContent;
  }
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

function asLayoutPlan(value: unknown): LayoutPlan | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as LayoutPlan;
}

export function resolveDocumentLayout(input: ResolveDocumentLayoutInput): ResolvedDocumentLayout {
  const normalizedContent = ensureStableNodeIds(asDocumentContent(input.content));
  const resolved = resolveLayoutPlan(normalizedContent, asLayoutPlan(input.layoutPlan), {
    documentKind: input.kind ?? null,
    documentTitle: input.title ?? null,
  });

  return {
    content: resolved.content,
    layoutPlan: resolved.layoutPlan,
  };
}
