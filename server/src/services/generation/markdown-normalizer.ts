type TipTapLikeNode = {
  type?: unknown;
  attrs?: Record<string, unknown> | null;
  content?: TipTapLikeNode[] | null;
  text?: unknown;
};

const WRAPPED_MARKDOWN_LANGUAGES = new Set([
  '',
  'markdown',
  'md',
  'mdx',
  'text',
  'txt',
  'plain',
  'plaintext',
]);

export function normalizeGeneratedMarkdown(markdown: string): string {
  const withoutBom = markdown.replace(/^\uFEFF/, '');
  const trimmed = withoutBom.trim();
  const wrappedFenceMatch = trimmed.match(/^```([^\r\n`]*)\r?\n([\s\S]*?)\r?\n```$/);
  if (!wrappedFenceMatch) {
    return withoutBom;
  }

  const language = wrappedFenceMatch[1]?.trim().toLowerCase() ?? '';
  if (!WRAPPED_MARKDOWN_LANGUAGES.has(language)) {
    return withoutBom;
  }

  return wrappedFenceMatch[2].trim();
}

export function extractMarkdownFromWrappedCodeBlock(content: unknown): string | null {
  if (!content || typeof content !== 'object') return null;

  const root = content as TipTapLikeNode;
  if (root.type !== 'doc' || !Array.isArray(root.content) || root.content.length !== 1) {
    return null;
  }

  const onlyNode = root.content[0];
  if (!onlyNode || onlyNode.type !== 'codeBlock') {
    return null;
  }

  const language = typeof onlyNode.attrs?.language === 'string'
    ? onlyNode.attrs.language.trim().toLowerCase()
    : '';
  if (!WRAPPED_MARKDOWN_LANGUAGES.has(language)) {
    return null;
  }

  const text = collectTextContent(onlyNode).trim();
  if (!text) return null;

  return normalizeGeneratedMarkdown(text);
}

function collectTextContent(node: TipTapLikeNode): string {
  const parts: string[] = [];
  if (typeof node.text === 'string') {
    parts.push(node.text);
  }
  for (const child of node.content ?? []) {
    parts.push(collectTextContent(child));
  }
  return parts.join('');
}
