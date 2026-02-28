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
    it('should create an Anthropic model', () => {
      const model = createModel('anthropic', 'sk-ant-test-key');
      expect(model).toBeDefined();
      expect(model.modelId).toBe('claude-sonnet-4-20250514');
    });

    it('should create an OpenAI model', () => {
      const model = createModel('openai', 'sk-test-key');
      expect(model).toBeDefined();
      expect(model.modelId).toBe('gpt-4o');
    });

    it('should create an Ollama model with default baseUrl', () => {
      const model = createModel('ollama', 'ollama');
      expect(model).toBeDefined();
      expect(model.modelId).toBe('llama3.1:8b');
    });

    it('should create an Ollama model with custom baseUrl', () => {
      const model = createModel('ollama', 'ollama', 'mistral:7b', 'http://my-server:11434');
      expect(model).toBeDefined();
      expect(model.modelId).toBe('mistral:7b');
    });

    it('should use custom model when specified', () => {
      const model = createModel('openai', 'sk-test', 'gpt-4o-mini');
      expect(model.modelId).toBe('gpt-4o-mini');
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
