import type { DocumentContent } from './types/document.js';

export interface TocEntry {
  level: number;
  prefix: string;
  title: string;
}

function extractTextContent(node: DocumentContent): string {
  if (node.type === 'text') return node.text || '';
  if (!node.content) return '';
  return node.content.map((child) => extractTextContent(child)).join('');
}

function walkTocEntries(node: DocumentContent, entries: TocEntry[]): void {
  if (node.type === 'chapterHeader') {
    const chapterNumber = String(node.attrs?.chapterNumber || '');
    entries.push({
      level: 1,
      prefix: chapterNumber ? `${chapterNumber}.` : '',
      title: String(node.attrs?.title || 'Untitled Chapter'),
    });
  } else if (node.type === 'heading') {
    const level = Number(node.attrs?.level ?? 2);
    if (level >= 1 && level <= 3) {
      const title = extractTextContent(node).trim();
      if (title) {
        entries.push({
          level,
          prefix: '',
          title,
        });
      }
    }
  }

  for (const child of node.content ?? []) {
    walkTocEntries(child, entries);
  }
}

export function extractTocEntriesFromContent(content: DocumentContent | null | undefined): TocEntry[] {
  if (!content) return [];

  const entries: TocEntry[] = [];
  walkTocEntries(content, entries);
  return entries;
}

export function extractTocEntriesFromDocuments(
  docs: Array<{ content: DocumentContent | null | undefined }>,
): TocEntry[] {
  const entries: TocEntry[] = [];

  for (const doc of docs) {
    if (!doc.content) continue;
    walkTocEntries(doc.content, entries);
  }

  return entries;
}
