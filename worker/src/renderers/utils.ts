export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Sanitize a URL for use in HTML src/href attributes.
 * Blocks javascript: and data: URIs (except data:image).
 * Returns '#' for unsafe URLs.
 */
export function safeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:')) return '#';
  if (trimmed.startsWith('data:') && !trimmed.startsWith('data:image/')) return '#';
  return escapeHtml(url);
}

/**
 * Sanitize a URL for use in CSS url() context.
 * Validates protocol and escapes CSS-unsafe characters.
 * Returns null for unsafe URLs.
 */
export function safeCssUrl(url: string): string | null {
  const trimmed = url.trim().toLowerCase();
  if (trimmed.startsWith('javascript:')) return null;
  if (trimmed.startsWith('data:') && !trimmed.startsWith('data:image/')) return null;

  // Reject URLs with CSS-injection characters that could break out of url() context
  if (/[()'"\\;{}]/.test(url)) return null;

  return escapeHtml(url);
}
