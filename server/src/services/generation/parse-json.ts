/**
 * Parse a JSON response from the AI, handling common issues
 * like markdown fences and trailing text.
 */
export function parseJsonResponse(text: string): unknown {
  let cleaned = text.trim();

  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence > 0) cleaned = cleaned.slice(0, lastFence);
    cleaned = cleaned.trim();
  }

  return JSON.parse(cleaned);
}
