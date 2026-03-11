/**
 * Parse a JSON response from the AI, handling common issues
 * like markdown fences, trailing commas, and preamble/postamble text.
 */
export function parseJsonResponse(text: string): unknown {
  let cleaned = text.trim();

  // Strip markdown fences
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n');
    cleaned = cleaned.slice(firstNewline + 1);
    const lastFence = cleaned.lastIndexOf('```');
    if (lastFence > 0) cleaned = cleaned.slice(0, lastFence);
    cleaned = cleaned.trim();
  }

  // Try strict parse first
  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with recovery strategies
  }

  // Extract JSON object or array from surrounding text
  const jsonStart = cleaned.search(/[\[{]/);
  if (jsonStart > 0) {
    cleaned = cleaned.slice(jsonStart);
  }

  // Find matching closing bracket
  const opener = cleaned[0];
  if (opener === '{' || opener === '[') {
    const closer = opener === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    let lastClose = -1;

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (escaped) { escaped = false; continue; }
      if (ch === '\\' && inString) { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === opener) depth++;
      if (ch === closer) { depth--; if (depth === 0) { lastClose = i; break; } }
    }

    if (lastClose > 0) {
      cleaned = cleaned.slice(0, lastClose + 1);
    }
  }

  // Remove trailing commas before } or ]
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return JSON.parse(cleaned);
}
