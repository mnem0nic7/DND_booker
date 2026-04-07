import { describe, it, expect } from 'vitest';
import {
  assertSafeUrl,
  createModel,
  normalizeOllamaBaseUrl,
  parseOllamaChatChunk,
  resolveOllamaModelId,
  SUPPORTED_MODELS,
  validateConnection,
} from '../services/ai-provider.service.js';

// Pure unit tests for ai-provider.service — no real API calls.

describe('AI Provider Service', () => {
  describe('SUPPORTED_MODELS', () => {
    it('should have entries for all providers', () => {
      expect(SUPPORTED_MODELS).toHaveProperty('anthropic');
      expect(SUPPORTED_MODELS).toHaveProperty('google');
      expect(SUPPORTED_MODELS).toHaveProperty('openai');
      expect(SUPPORTED_MODELS).toHaveProperty('ollama');
    });

    it('should have Anthropic models', () => {
      expect(SUPPORTED_MODELS.anthropic.length).toBeGreaterThan(0);
      expect(SUPPORTED_MODELS.anthropic).toContain('claude-sonnet-4-6');
    });

    it('should have OpenAI models', () => {
      expect(SUPPORTED_MODELS.openai.length).toBeGreaterThan(0);
      expect(SUPPORTED_MODELS.openai).toContain('gpt-4o');
    });

    it('should have empty Ollama models list (dynamically loaded)', () => {
      expect(SUPPORTED_MODELS.ollama).toEqual([]);
    });
  });

  describe('createModel', () => {
    it('should create an Anthropic model without throwing', () => {
      expect(() => createModel('anthropic', 'sk-ant-test-key')).not.toThrow();
      expect(createModel('anthropic', 'sk-ant-test-key')).toBeDefined();
    });

    it('should create an OpenAI model without throwing', () => {
      expect(() => createModel('openai', 'sk-test-key')).not.toThrow();
      expect(createModel('openai', 'sk-test-key')).toBeDefined();
    });

    it('should create a Google model without throwing', () => {
      expect(() => createModel('google', 'google-test-key')).not.toThrow();
      expect(createModel('google', 'google-test-key')).toBeDefined();
    });

    it('should create an Ollama model without throwing', () => {
      expect(() => createModel('ollama', 'ollama')).not.toThrow();
      expect(createModel('ollama', 'ollama')).toBeDefined();
    });

    it('should create an Ollama model with custom baseUrl', () => {
      expect(() => createModel('ollama', 'ollama', 'mistral:7b', 'http://my-server:11434')).not.toThrow();
    });

    it('should accept custom model names', () => {
      expect(() => createModel('openai', 'sk-test', 'gpt-4o-mini')).not.toThrow();
      expect(() => createModel('google', 'google-test', 'gemini-2.5-flash')).not.toThrow();
      expect(() => createModel('anthropic', 'sk-ant-test', 'claude-haiku-4-20250414')).not.toThrow();
    });
  });

  describe('resolveOllamaModelId', () => {
    it('should keep valid Ollama model ids', () => {
      expect(resolveOllamaModelId('llama3.2:3b')).toBe('llama3.2:3b');
    });

    it('should fall back to the default Ollama model for non-Ollama ids', () => {
      expect(resolveOllamaModelId('gpt-4o')).toBe('llama3.2:3b');
      expect(resolveOllamaModelId('claude-sonnet-4-6')).toBe('llama3.2:3b');
    });
  });

  describe('normalizeOllamaBaseUrl', () => {
    it('trims trailing slashes', () => {
      expect(normalizeOllamaBaseUrl('http://example.com:11434///')).toBe('http://example.com:11434');
    });
  });

  describe('assertSafeUrl', () => {
    it('allows localhost on the Ollama default port', () => {
      expect(() => assertSafeUrl('http://localhost:11434')).not.toThrow();
    });

    it('rejects localhost on other ports', () => {
      expect(() => assertSafeUrl('http://localhost:4000')).toThrow('Loopback addresses are not allowed');
    });
  });

  describe('parseOllamaChatChunk', () => {
    it('should extract streamed assistant text', () => {
      expect(parseOllamaChatChunk('{"message":{"content":"Hello"}}')).toBe('Hello');
    });

    it('should ignore empty or done-only chunks', () => {
      expect(parseOllamaChatChunk('{"done":true}')).toBeNull();
      expect(parseOllamaChatChunk('   ')).toBeNull();
    });

    it('should throw for Ollama error chunks', () => {
      expect(() => parseOllamaChatChunk('{"error":"bad request"}')).toThrow('[Ollama] bad request');
    });
  });

  describe('validateConnection', () => {
    it('should return invalid for unreachable URL', async () => {
      const result = await validateConnection('http://localhost:1');
      expect(result).toEqual({ valid: false, models: [] });
    });

    it('should return invalid for non-Ollama URL', async () => {
      const result = await validateConnection('http://localhost:99999');
      expect(result).toEqual({ valid: false, models: [] });
    });
  });
});
    it('should have Google models', () => {
      expect(SUPPORTED_MODELS.google.length).toBeGreaterThan(0);
      expect(SUPPORTED_MODELS.google).toContain('gemini-2.5-pro');
    });
