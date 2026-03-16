import { afterEach, describe, expect, it, vi } from 'vitest';

const generateImageMock = vi.fn();

vi.mock('ai', () => ({
  generateImage: generateImageMock,
}));

vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({
    image: (model: string) => model,
  }),
}));

describe('ai-image hard timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    delete process.env.AI_IMAGE_TIMEOUT_MS;
  });

  it('rejects if the image provider never resolves', async () => {
    vi.useFakeTimers();
    process.env.AI_IMAGE_TIMEOUT_MS = '1000';
    generateImageMock.mockImplementation(() => new Promise(() => {}));

    const { generateAiImage } = await import('../services/ai-image.service.js');

    const pending = generateAiImage('test-key', {
      prompt: 'A moonlit mine entrance with wet stone and no signage.',
      model: 'gpt-image-1',
      size: '1024x1024',
    });
    const failure = pending.catch((error) => error);

    await vi.advanceTimersByTimeAsync(1000);

    const error = await failure;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('Image generation timed out after 1s');
  });
});
