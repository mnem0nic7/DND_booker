/**
 * Parse a JSON response from the AI, handling common issues
 * like markdown fences, trailing commas, and preamble/postamble text.
 */
export function parseJsonResponse(text: string): unknown {
  let cleaned = stripMarkdownFences(text.trim());

  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with recovery strategies.
  }

  cleaned = extractJsonPayload(cleaned);
  cleaned = normalizeSmartQuotes(cleaned);
  cleaned = stripJsonComments(cleaned);
  cleaned = convertSingleQuotedStrings(cleaned);
  cleaned = quoteBareObjectKeys(cleaned);
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(cleaned);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = cleaned.slice(0, 240).replace(/\s+/g, ' ');
    throw new Error(`Failed to parse AI JSON response: ${message}. Preview: ${preview}`);
  }
}

function stripMarkdownFences(text: string): string {
  if (!text.startsWith('```')) return text;

  const firstNewline = text.indexOf('\n');
  if (firstNewline < 0) return text.replace(/```/g, '').trim();

  let cleaned = text.slice(firstNewline + 1);
  const lastFence = cleaned.lastIndexOf('```');
  if (lastFence > 0) cleaned = cleaned.slice(0, lastFence);
  return cleaned.trim();
}

function extractJsonPayload(text: string): string {
  const jsonStart = text.search(/[\[{]/);
  if (jsonStart > 0) {
    text = text.slice(jsonStart);
  }

  const opener = text[0];
  if (opener !== '{' && opener !== '[') return text;

  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inDoubleString = false;
  let inSingleString = false;
  let escaped = false;
  let lastClose = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && (inDoubleString || inSingleString)) {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inSingleString) {
      inDoubleString = !inDoubleString;
      continue;
    }
    if (ch === '\'' && !inDoubleString) {
      inSingleString = !inSingleString;
      continue;
    }
    if (inDoubleString || inSingleString) continue;

    if (ch === opener) depth++;
    if (ch === closer) {
      depth--;
      if (depth === 0) {
        lastClose = i;
        break;
      }
    }
  }

  if (lastClose > 0) {
    return text.slice(0, lastClose + 1);
  }

  return text;
}

function normalizeSmartQuotes(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, '\'')
    .replace(/[\u201C\u201D]/g, '"');
}

function stripJsonComments(text: string): string {
  let out = '';
  let inDoubleString = false;
  let inSingleString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\' && (inDoubleString || inSingleString)) {
      out += ch;
      escaped = true;
      continue;
    }

    if (ch === '"' && !inSingleString) {
      inDoubleString = !inDoubleString;
      out += ch;
      continue;
    }

    if (ch === '\'' && !inDoubleString) {
      inSingleString = !inSingleString;
      out += ch;
      continue;
    }

    if (!inDoubleString && !inSingleString && ch === '/' && next === '/') {
      i += 2;
      while (i < text.length && text[i] !== '\n') i++;
      if (i < text.length) out += '\n';
      continue;
    }

    if (!inDoubleString && !inSingleString && ch === '/' && next === '*') {
      i += 2;
      while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
      continue;
    }

    out += ch;
  }

  return out;
}

function convertSingleQuotedStrings(text: string): string {
  let out = '';
  let inDoubleString = false;
  let inSingleString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inSingleString) {
      if (escaped) {
        if (ch === '"') {
          out += '\\"';
        } else if (ch === '\'') {
          out += '\'';
        } else {
          out += `\\${ch}`;
        }
        escaped = false;
        continue;
      }

      if (ch === '\\') {
        escaped = true;
        continue;
      }

      if (ch === '\'') {
        inSingleString = false;
        out += '"';
        continue;
      }

      if (ch === '"') {
        out += '\\"';
        continue;
      }

      out += ch;
      continue;
    }

    if (ch === '"' && !escaped) {
      inDoubleString = !inDoubleString;
      out += ch;
      continue;
    }

    if (!inDoubleString && ch === '\'') {
      inSingleString = true;
      out += '"';
      continue;
    }

    if (ch === '\\' && inDoubleString) {
      out += ch;
      escaped = !escaped;
      continue;
    }

    escaped = false;
    out += ch;
  }

  return out;
}

function quoteBareObjectKeys(text: string): string {
  let out = '';
  let i = 0;
  let inDoubleString = false;
  let escaped = false;

  while (i < text.length) {
    const ch = text[i];

    if (escaped) {
      out += ch;
      escaped = false;
      i++;
      continue;
    }

    if (ch === '\\' && inDoubleString) {
      out += ch;
      escaped = true;
      i++;
      continue;
    }

    if (ch === '"') {
      inDoubleString = !inDoubleString;
      out += ch;
      i++;
      continue;
    }

    if (!inDoubleString && (ch === '{' || ch === ',')) {
      out += ch;
      i++;

      while (i < text.length && /\s/.test(text[i])) {
        out += text[i];
        i++;
      }

      const keyMatch = text.slice(i).match(/^([A-Za-z_$][A-Za-z0-9_$-]*)(\s*:)/);
      if (keyMatch) {
        out += `"${keyMatch[1]}"${keyMatch[2]}`;
        i += keyMatch[0].length;
      }
      continue;
    }

    out += ch;
    i++;
  }

  return out;
}
