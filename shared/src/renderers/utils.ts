function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

export function escapeHtml(text: unknown): string {
  return normalizeString(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow raster image data URIs — SVG data URIs can contain embedded scripts
const SAFE_DATA_PREFIXES = ['data:image/png', 'data:image/jpeg', 'data:image/gif', 'data:image/webp'];

function isSafeDataUri(trimmed: string): boolean {
  return SAFE_DATA_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

/**
 * Sanitize a URL for use in HTML src/href attributes.
 * Blocks javascript: and data: URIs (except safe raster image types).
 * Returns '#' for unsafe URLs.
 */
export function safeUrl(url: unknown): string {
  const normalized = normalizeString(url);
  const trimmed = normalized.trim().toLowerCase();
  if (trimmed.startsWith('javascript:')) return '#';
  if (trimmed.startsWith('data:') && !isSafeDataUri(trimmed)) return '#';
  return escapeHtml(normalized);
}

/**
 * Sanitize a URL for use in CSS url() context.
 * Validates protocol and escapes CSS-unsafe characters.
 * Returns null for unsafe URLs.
 */
export function safeCssUrl(url: unknown): string | null {
  const normalized = normalizeString(url);
  const trimmed = normalized.trim().toLowerCase();
  if (trimmed.startsWith('javascript:')) return null;
  if (trimmed.startsWith('data:') && !isSafeDataUri(trimmed)) return null;

  // Reject URLs with CSS-injection characters that could break out of url() context
  if (/[()'"\\;{}]/.test(normalized)) return null;

  return escapeHtml(normalized);
}

/**
 * Escape special Typst markup characters in plain text.
 * Characters that have special meaning in Typst are prefixed with backslash.
 */
export function escapeTypst(text: unknown): string {
  return normalizeString(text).replace(/[\\*_`#@$<>\[\]]/g, (ch) => `\\${ch}`);
}

/**
 * Escape a URL for safe interpolation inside Typst string literals (double-quoted).
 * Prevents injection via `"` or `\` characters in user-controlled URLs.
 */
export function escapeTypstUrl(url: unknown): string {
  return normalizeString(url).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}
