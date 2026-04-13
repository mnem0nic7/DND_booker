import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockGenerateObject, mockGenerateText } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockGenerateText: vi.fn(),
}));

vi.mock('ai', () => ({
  generateObject: mockGenerateObject,
  generateText: mockGenerateText,
}));

import { generateObjectWithTimeout } from '../../services/generation/model-timeouts.js';

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
