import { generateObject, generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const DEFAULT_GENERATION_TEXT_TIMEOUT_MS = 240_000;
const DEFAULT_GENERATION_TEXT_ATTEMPTS = 2;
const DEFAULT_GENERATION_OBJECT_ATTEMPTS = 3;

function resolveTimeoutMs(fallbackMs: number): number {
  const parsed = Number.parseInt(process.env.GENERATION_TEXT_TIMEOUT_MS ?? '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackMs;
}

function isAbortLikeError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.name === 'AbortError'
    || error.name === 'TimeoutError'
    || /aborted|timeout/i.test(error.message);
}

function isRetriableGenerateObjectError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  return message.includes('no object generated')
    || message.includes('could not parse the response')
    || message.includes('response did not match')
    || message.includes('did not match schema')
    || message.includes('invalid json')
    || message.includes('json parse');
}

function buildTextTimeoutError(label: string, timeoutMs: number): Error {
  return new Error(`${label} timed out after ${Math.round(timeoutMs / 1000)}s`);
}

async function withHardTextTimeout<T>(
  label: string,
  timeoutMs: number,
  task: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();

  return await new Promise<T>((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(buildTextTimeoutError(label, timeoutMs));
    }, timeoutMs);

    task(controller.signal)
      .then((value) => {
        clearTimeout(timeoutHandle);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutHandle);
        if (isAbortLikeError(error)) {
          reject(buildTextTimeoutError(label, timeoutMs));
          return;
        }
        reject(error);
      });
  });
}

export async function generateTextWithTimeout(
  label: string,
  options: Parameters<typeof generateText>[0],
  fallbackMs = DEFAULT_GENERATION_TEXT_TIMEOUT_MS,
): Promise<any> {
  const timeoutMs = resolveTimeoutMs(fallbackMs);
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= DEFAULT_GENERATION_TEXT_ATTEMPTS; attempt += 1) {
    try {
      return await withHardTextTimeout(label, timeoutMs, async (signal) => generateText({
        ...options,
        abortSignal: signal,
      }));
    } catch (error) {
      lastError = error;
      if (!isAbortLikeError(error) || attempt >= DEFAULT_GENERATION_TEXT_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

function isOllamaModel(model: LanguageModel): boolean {
  return typeof (model as Record<string, unknown>).provider === 'string'
    && ((model as Record<string, unknown>).provider as string).startsWith('ollama');
}

/**
 * Build a compact example JSON object from a JSON Schema.
 * Uses type-appropriate defaults so the model sees the exact nested structure it must produce.
 * Much clearer than dotted field paths which models interpret as literal key names.
 */
function buildJsonTemplate(schema: Record<string, unknown>): unknown {
  // Unwrap anyOf: prefer the non-null variant
  const anyOf = schema.anyOf as Array<Record<string, unknown>> | undefined;
  if (anyOf) {
    const nonNull = anyOf.find((s) => s.type !== 'null');
    return nonNull ? buildJsonTemplate(nonNull) : null;
  }

  const type = schema.type as string | undefined;
  const enumVals = schema.enum as unknown[] | undefined;
  if (enumVals) return enumVals[0];

  if (type === 'object') {
    const props = schema.properties as Record<string, Record<string, unknown>> | undefined;
    if (!props) return {};
    return Object.fromEntries(
      Object.entries(props).map(([key, val]) => [key, buildJsonTemplate(val)]),
    );
  }
  if (type === 'array') {
    return [];
  }
  if (type === 'boolean') return false;
  if (type === 'integer' || type === 'number') return 0;
  if (type === 'null') return null;
  return '...';  // string and anything else — non-empty so the model fills it in
}

/**
 * Coerce a raw parsed object to match a Zod schema as closely as possible,
 * fixing the most common small-model mistakes before strict Zod validation:
 *   - String-encoded numbers/booleans coerced to their native types
 *   - Enum values matched case-insensitively (and snake_case normalized)
 *   - Null represented as string "null" converted to JS null
 *   - Missing optional object keys filled with undefined (Zod handles them)
 */
function coerceForSchema(value: unknown, schema: z.ZodType): unknown {
  // Unwrap ZodOptional / ZodDefault / ZodNullable
  let inner = schema;
  while (
    inner instanceof z.ZodOptional
    || inner instanceof z.ZodDefault
    || inner instanceof z.ZodNullable
    || inner instanceof z.ZodEffects
  ) {
    if (inner instanceof z.ZodEffects) {
      inner = inner.innerType();
    } else {
      inner = (inner as z.ZodOptional<z.ZodType> | z.ZodNullable<z.ZodType>).unwrap();
    }
  }

  // string "null" → actual null (for nullable fields)
  if (schema instanceof z.ZodNullable && value === 'null') return null;

  if (inner instanceof z.ZodObject) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const shape = inner.shape as Record<string, z.ZodType>;
    const result: Record<string, unknown> = { ...(value as Record<string, unknown>) };
    for (const [key, fieldSchema] of Object.entries(shape)) {
      if (key in result) {
        result[key] = coerceForSchema(result[key], fieldSchema);
      }
    }
    return result;
  }

  if (inner instanceof z.ZodArray) {
    if (!Array.isArray(value)) return value;
    return value.map((item) => coerceForSchema(item, inner.element));
  }

  if (inner instanceof z.ZodEnum) {
    if (typeof value === 'string') {
      const options: string[] = inner.options;
      // exact match first
      if (options.includes(value)) return value;
      // case-insensitive + normalise spaces/hyphens to underscores
      const normalized = value.toLowerCase().replace(/[\s-]+/g, '_');
      const match = options.find((o) => o.toLowerCase() === normalized);
      if (match) return match;
    }
    return value;
  }

  if (inner instanceof z.ZodString) {
    // Small models output null/undefined for fields they "don't know yet".
    // Replace with a placeholder so .min(1) passes; the model fills it on retry
    // or the caller's fallback path normalises it later.
    if (value === null || value === undefined) return 'TBD';
    return value;
  }

  if (inner instanceof z.ZodNumber) {
    if (typeof value === 'string' && value.trim() !== '') {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
    return value;
  }

  if (inner instanceof z.ZodBoolean) {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  }

  // ZodUnion / ZodDiscriminatedUnion — try each branch
  if (inner instanceof z.ZodUnion) {
    for (const option of (inner as z.ZodUnion<[z.ZodType, ...z.ZodType[]]>).options) {
      try {
        return coerceForSchema(value, option);
      } catch {
        // try next
      }
    }
  }

  return value;
}

/**
 * Ollama compiles Zod schemas into ABNF grammar for constrained sampling,
 * which crashes llama.cpp on complex schemas. For Ollama, use generateText
 * with a JSON instruction and parse/validate the result manually.
 */
async function generateObjectViaText<T>(
  label: string,
  options: Parameters<typeof generateObject>[0] & { schema: z.ZodType<T> },
  timeoutMs: number,
): Promise<{ object: T }> {
  const jsonSchema = zodToJsonSchema(options.schema, { $refStrategy: 'none' });
  // Build a compact example JSON showing the exact nested structure.
  // Dotted-path hints confuse small models into generating flat keys ("brief.title" instead of nested).
  const template = buildJsonTemplate(jsonSchema as Record<string, unknown>);
  const callerSystem: string = (options as any).system ?? '';
  const schemaInstruction = `IMPORTANT: Respond with ONLY a valid JSON object — no markdown, no explanation, no preamble. Keep all string values concise (1-3 sentences max). Use this exact structure (fill in appropriate values):\n${JSON.stringify(template)}`;
  const systemPrompt = callerSystem
    ? `${callerSystem}\n\n${schemaInstruction}`
    : schemaInstruction;

  const messages = Array.isArray((options as any).messages)
    ? (options as any).messages
    : [{ role: 'user' as const, content: (options as any).prompt ?? '' }];

  // Cap output tokens: JSON responses don't need more than 600 tokens.
  // Passing maxOutputTokens=4096 lets small models fill their context (2-4 min/call).
  const MAX_OLLAMA_OUTPUT_TOKENS = 600;
  const callerMaxOutput: number | undefined = (options as any).maxOutputTokens;
  const cappedMaxOutput = callerMaxOutput
    ? Math.min(callerMaxOutput, MAX_OLLAMA_OUTPUT_TOKENS)
    : MAX_OLLAMA_OUTPUT_TOKENS;

  for (let attempt = 1; attempt <= DEFAULT_GENERATION_OBJECT_ATTEMPTS; attempt += 1) {
    const result = await withHardTextTimeout(label, timeoutMs, async (signal) =>
      generateText({
        model: options.model,
        system: systemPrompt,
        messages,
        maxOutputTokens: cappedMaxOutput,
        abortSignal: signal,
      }),
    );

    const raw = result.text.trim();
    // Strip markdown code fences if present
    const json = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

    try {
      const parsed = JSON.parse(json);
      const coerced = coerceForSchema(parsed, options.schema);
      const validated = options.schema.parse(coerced) as T;
      return { object: validated };
    } catch {
      if (attempt >= DEFAULT_GENERATION_OBJECT_ATTEMPTS) {
        throw new Error(`${label}: response did not match schema after ${attempt} attempts`);
      }
    }
  }

  throw new Error(`${label} failed`);
}

export async function generateObjectWithTimeout(
  label: string,
  options: Parameters<typeof generateObject>[0],
  fallbackMs = DEFAULT_GENERATION_TEXT_TIMEOUT_MS,
): Promise<any> {
  const timeoutMs = resolveTimeoutMs(fallbackMs);
  let lastError: unknown = null;

  // Ollama crashes when generateObject compiles complex schemas to ABNF grammar.
  // Use generateText + manual JSON parse instead.
  if (isOllamaModel(options.model)) {
    return generateObjectViaText(label, options as any, timeoutMs);
  }

  for (let attempt = 1; attempt <= DEFAULT_GENERATION_OBJECT_ATTEMPTS; attempt += 1) {
    try {
      return await withHardTextTimeout(label, timeoutMs, async (signal) => generateObject({
        ...options,
        abortSignal: signal,
      }));
    } catch (error) {
      lastError = error;
      if ((!isAbortLikeError(error) && !isRetriableGenerateObjectError(error))
        || attempt >= DEFAULT_GENERATION_OBJECT_ATTEMPTS) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}
