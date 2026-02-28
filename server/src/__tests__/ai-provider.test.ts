import { describe, it, expect } from 'vitest';
import { createModel, SUPPORTED_MODELS, validateConnection } from '../services/ai-provider.service.js';

// Pure unit tests for ai-provider.service — no real API calls.

describe('AI Provider Service', () => {
  describe('SUPPORTED_MODELS', () => {
    it('should have entries for all three providers', () => {
      expect(SUPPORTED_MODELS).toHaveProperty('anthropic');
      expect(SUPPORTED_MODELS).toHaveProperty('openai');
      expect(SUPPORTED_MODELS).toHaveProperty('ollama');
    });

    it('should have Anthropic models', () => {
      expect(SUPPORTED_MODELS.anthropic.length).toBeGreaterThan(0);
      expect(SUPPORTED_MODELS.anthropic).toContain('claude-sonnet-4-20250514');
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

    it('should create an Ollama model without throwing', () => {
      expect(() => createModel('ollama', 'ollama')).not.toThrow();
      expect(createModel('ollama', 'ollama')).toBeDefined();
    });

    it('should create an Ollama model with custom baseUrl', () => {
      expect(() => createModel('ollama', 'ollama', 'mistral:7b', 'http://my-server:11434')).not.toThrow();
    });

    it('should accept custom model names', () => {
      expect(() => createModel('openai', 'sk-test', 'gpt-4o-mini')).not.toThrow();
      expect(() => createModel('anthropic', 'sk-ant-test', 'claude-haiku-4-20250414')).not.toThrow();
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
