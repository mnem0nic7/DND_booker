import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const { mockGenerateObject, mockGenerateText } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGenerateText: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
  generateText: mockGenerateText,
}));

import { generateObjectWithTimeout } from '../../services/generation/model-timeouts.js';

// A model object the isOllamaModel() guard recognizes (provider starts with "ollama").
const ollamaModel = { provider: 'ollama.chat' } as never;

describe('generateObjectWithTimeout', () => {
  afterEach(() => {
    mockGenerateObject.mockReset();
    mockGenerateText.mockReset();
  });

  it('retries structured-output parse failures', async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error('No object generated: could not parse the response.'))
      .mockResolvedValueOnce({ object: { ok: true } });

    const result = await generateObjectWithTimeout('Structured generation', {
      model: {} as never,
      schema: {} as never,
      prompt: 'test',
    });

    expect(result).toEqual({ object: { ok: true } });
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retriable failures', async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error('quota exceeded'));

    await expect(generateObjectWithTimeout('Structured generation', {
      model: {} as never,
      schema: {} as never,
      prompt: 'test',
    })).rejects.toThrow('quota exceeded');

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });
});

describe('generateObjectWithTimeout (Ollama text path)', () => {
  afterEach(() => {
    mockGenerateObject.mockReset();
    mockGenerateText.mockReset();
  });

  const briefSchema = z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
  });

  it('extracts a JSON object from prose-wrapped model output', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: 'Sure! Here is the brief you asked for:\n{"title": "The Sunken Crypt", "summary": "A short delve."}\nHope that helps!',
    });

    const result = await generateObjectWithTimeout('Brief', {
      model: ollamaModel,
      schema: briefSchema,
      prompt: 'make a brief',
    });

    expect(result.object).toEqual({ title: 'The Sunken Crypt', summary: 'A short delve.' });
    expect(mockGenerateObject).not.toHaveBeenCalled();
  });

  it('extracts the first object when the model appends trailing content after it', async () => {
    // Real qwen2.5:3b behavior: a valid object immediately followed by more text
    // (a second object, a repeat, or notes). Must trim to the first balanced
    // object rather than feeding the whole string to JSON.parse.
    mockGenerateText.mockResolvedValueOnce({
      text: '{"title": "First", "summary": "The real one."}\n{"title": "Second", "summary": "junk"}\nThanks!',
    });

    const result = await generateObjectWithTimeout('Brief', {
      model: ollamaModel,
      schema: briefSchema,
      prompt: 'make a brief',
    });

    expect(result.object).toEqual({ title: 'First', summary: 'The real one.' });
  });

  it('does not silently fill missing required strings with a placeholder', async () => {
    // Every attempt returns null for `summary`. The model path must NOT invent
    // placeholder text (e.g. "TBD") to force validation — it must surface the
    // schema failure so callers can fall back to their own higher-quality
    // recovery path instead of shipping placeholder text into published content.
    mockGenerateText.mockResolvedValue({ text: '{"title": "Only A Title", "summary": null}' });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(generateObjectWithTimeout('Brief', {
      model: ollamaModel,
      schema: briefSchema,
      prompt: 'make a brief',
    })).rejects.toThrow(/did not match schema/i);

    // The failure must be observable, not swallowed.
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('feeds the prior failure back into the next attempt and recovers', async () => {
    mockGenerateText
      .mockResolvedValueOnce({ text: 'not json at all' })
      .mockResolvedValueOnce({ text: '{"title": "Recovered", "summary": "Second try worked."}' });

    const result = await generateObjectWithTimeout('Brief', {
      model: ollamaModel,
      schema: briefSchema,
      prompt: 'make a brief',
    });

    expect(result.object).toEqual({ title: 'Recovered', summary: 'Second try worked.' });
    expect(mockGenerateText).toHaveBeenCalledTimes(2);

    // The retry must carry corrective context: the prior raw output appears in
    // the second call's messages so the model can repair rather than blindly repeat.
    const secondCallMessages = mockGenerateText.mock.calls[1]![0].messages as Array<{ content: string }>;
    const repairText = secondCallMessages.map((m) => m.content).join('\n');
    expect(repairText).toContain('not json at all');
  });

  it('coerces string-encoded scalars before validating', async () => {
    const numericSchema = z.object({
      title: z.string().min(1),
      pages: z.number(),
      strict: z.boolean(),
    });
    mockGenerateText.mockResolvedValueOnce({
      text: '{"title": "X", "pages": "12", "strict": "true"}',
    });

    const result = await generateObjectWithTimeout('Brief', {
      model: ollamaModel,
      schema: numericSchema,
      prompt: 'make a brief',
    });

    expect(result.object).toEqual({ title: 'X', pages: 12, strict: true });
  });

  it('returns token usage so run accounting works on the local path', async () => {
    const schema = z.object({ title: z.string().min(1) });
    mockGenerateText.mockResolvedValueOnce({
      text: '{"title": "X"}',
      usage: { inputTokens: 800, outputTokens: 1200 },
    });

    const result = await generateObjectWithTimeout('Brief', {
      model: ollamaModel,
      schema,
      prompt: 'make a brief',
    });

    expect(result.usage).toEqual({ inputTokens: 800, outputTokens: 1200 });
  });

  it('lists all allowed enum values in the prompt so the model is not biased to the first option', async () => {
    const enumSchema = z.object({
      mode: z.enum(['one_shot', 'module']),
      tags: z.array(z.enum(['combat', 'puzzle', 'social'])),
    });
    mockGenerateText.mockResolvedValueOnce({
      text: '{"mode": "module", "tags": ["puzzle"]}',
    });

    await generateObjectWithTimeout('Brief', {
      model: ollamaModel,
      schema: enumSchema,
      prompt: 'make a brief',
    });

    const systemPrompt = mockGenerateText.mock.calls[0]![0].system as string;
    expect(systemPrompt).toContain('one_shot | module');
    expect(systemPrompt).toContain('combat | puzzle | social');
  });
});
