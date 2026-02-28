import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../index.js';
import { prisma } from '../config/database.js';

// Integration tests for AI routes.
// Requires running PostgreSQL. AI provider calls are NOT tested here
// (no real API keys) — we test validation, auth, and error paths.

const TEST_USER = {
  email: 'ai-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'AI Test User',
};

let accessToken: string;
let projectId: string;

describe('AI Routes', () => {
  beforeAll(async () => {
    // Clean up any existing test data
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.aiChatMessage.deleteMany({
        where: { session: { userId: existingUser.id } },
      });
      await prisma.aiChatSession.deleteMany({ where: { userId: existingUser.id } });
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }

    // Register and get token
    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;

    // Create a test project
    const projRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'AI Test Campaign' });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    const existingUser = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existingUser) {
      await prisma.aiChatMessage.deleteMany({
        where: { session: { userId: existingUser.id } },
      });
      await prisma.aiChatSession.deleteMany({ where: { userId: existingUser.id } });
      await prisma.project.deleteMany({ where: { userId: existingUser.id } });
      await prisma.user.delete({ where: { id: existingUser.id } });
    }
    await prisma.$disconnect();
  });

  // ─── Settings Routes ───────────────────────────────────────────

  describe('GET /api/ai/settings', () => {
    it('should return default settings for a new user', async () => {
      const res = await request(app)
        .get('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.provider).toBeNull();
      expect(res.body.model).toBeNull();
      expect(res.body.hasApiKey).toBe(false);
      expect(res.body.supportedModels).toBeDefined();
      expect(res.body.supportedModels.anthropic).toBeDefined();
      expect(res.body.supportedModels.openai).toBeDefined();
      expect(res.body.supportedModels.ollama).toBeDefined();
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).get('/api/ai/settings');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/settings', () => {
    it('should save provider and model (without API key)', async () => {
      const res = await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'anthropic', model: 'claude-sonnet-4-20250514' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify settings were saved
      const getRes = await request(app)
        .get('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(getRes.body.provider).toBe('anthropic');
      expect(getRes.body.model).toBe('claude-sonnet-4-20250514');
      expect(getRes.body.hasApiKey).toBe(false);
    });

    it('should save settings with API key', async () => {
      const res = await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          provider: 'openai',
          model: 'gpt-4o',
          apiKey: 'sk-test-fake-key-1234567890',
        });

      expect(res.status).toBe(200);

      const getRes = await request(app)
        .get('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(getRes.body.provider).toBe('openai');
      expect(getRes.body.model).toBe('gpt-4o');
      expect(getRes.body.hasApiKey).toBe(true);
    });

    it('should reject invalid provider', async () => {
      const res = await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'invalid', model: 'gpt-4o' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject unsupported model for provider', async () => {
      const res = await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'anthropic', model: 'gpt-4o' }); // gpt-4o is not an Anthropic model

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject API key that is too short', async () => {
      const res = await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'openai', model: 'gpt-4o', apiKey: 'short' });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/ai/settings')
        .send({ provider: 'openai', model: 'gpt-4o' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/ai/settings/key', () => {
    it('should remove the stored API key', async () => {
      // First ensure there's a key
      await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test-key-to-remove-1234' });

      const res = await request(app)
        .delete('/api/ai/settings/key')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify key was removed
      const getRes = await request(app)
        .get('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(getRes.body.hasApiKey).toBe(false);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app).delete('/api/ai/settings/key');
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/settings/validate', () => {
    it('should reject missing fields', async () => {
      const res = await request(app)
        .post('/api/ai/settings/validate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'openai' }); // missing apiKey

      expect(res.status).toBe(400);
    });

    it('should return valid: false for fake key (no real provider call)', async () => {
      const res = await request(app)
        .post('/api/ai/settings/validate')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'openai', apiKey: 'sk-fake-key-that-wont-work-123456' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/ai/settings/validate')
        .send({ provider: 'openai', apiKey: 'sk-test-1234567890' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/settings (Ollama)', () => {
    it('should accept ollama provider with any model name', async () => {
      const res = await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'ollama', model: 'llama3.1:8b', baseUrl: 'http://localhost:11434' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const getRes = await request(app)
        .get('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(getRes.body.provider).toBe('ollama');
      expect(getRes.body.model).toBe('llama3.1:8b');
      expect(getRes.body.baseUrl).toBe('http://localhost:11434');
    });

    it('should accept ollama without API key and clear stale key', async () => {
      // First save with an API key on openai
      await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'openai', model: 'gpt-4o', apiKey: 'sk-test-fake-key-1234567890' });

      // Verify key was saved
      let getRes = await request(app)
        .get('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(getRes.body.hasApiKey).toBe(true);

      // Now switch to ollama — should clear the stale key
      const res = await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'ollama', model: 'mistral:7b' });

      expect(res.status).toBe(200);

      getRes = await request(app)
        .get('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(getRes.body.provider).toBe('ollama');
      expect(getRes.body.hasApiKey).toBe(false);
    });

    it('should skip model validation for ollama (any model name allowed)', async () => {
      const res = await request(app)
        .post('/api/ai/settings')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ provider: 'ollama', model: 'custom-fine-tuned:latest' });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/ai/settings/validate-ollama', () => {
    it('should reject missing baseUrl', async () => {
      const res = await request(app)
        .post('/api/ai/settings/validate-ollama')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject invalid URL format', async () => {
      const res = await request(app)
        .post('/api/ai/settings/validate-ollama')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ baseUrl: 'not-a-url' });

      expect(res.status).toBe(400);
    });

    it('should return invalid for unreachable Ollama server', async () => {
      const res = await request(app)
        .post('/api/ai/settings/validate-ollama')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ baseUrl: 'http://localhost:1' });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.models).toEqual([]);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/ai/settings/validate-ollama')
        .send({ baseUrl: 'http://localhost:11434' });
      expect(res.status).toBe(401);
    });
  });

  // ─── Chat Routes ───────────────────────────────────────────────

  describe('GET /api/projects/:projectId/ai/chat', () => {
    it('should return empty messages for new project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/chat`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.messages).toEqual([]);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000/ai/chat')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/chat`);
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/projects/:projectId/ai/chat', () => {
    it('should return 400 when AI is not configured (no API key)', async () => {
      // Ensure no API key is set
      await request(app)
        .delete('/api/ai/settings/key')
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/chat`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Create an orc war chief' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('AI not configured');
    });

    it('should reject empty message', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/chat`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: '' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent project', async () => {
      const res = await request(app)
        .post('/api/projects/00000000-0000-0000-0000-000000000000/ai/chat')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ message: 'Hello' });

      expect(res.status).toBe(404);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/chat`)
        .send({ message: 'Hello' });
      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/projects/:projectId/ai/chat', () => {
    it('should clear chat history', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}/ai/chat`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .delete(`/api/projects/${projectId}/ai/chat`);
      expect(res.status).toBe(401);
    });
  });

  // ─── Block Generation Routes ───────────────────────────────────

  describe('POST /api/ai/generate-block', () => {
    it('should return 400 when AI is not configured', async () => {
      const res = await request(app)
        .post('/api/ai/generate-block')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockType: 'statBlock', prompt: 'A goblin warrior' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('AI not configured');
    });

    it('should reject unsupported block type', async () => {
      const res = await request(app)
        .post('/api/ai/generate-block')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockType: 'invalidBlock', prompt: 'test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject missing prompt', async () => {
      const res = await request(app)
        .post('/api/ai/generate-block')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockType: 'statBlock' });

      expect(res.status).toBe(400);
    });

    it('should reject empty prompt', async () => {
      const res = await request(app)
        .post('/api/ai/generate-block')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockType: 'statBlock', prompt: '' });

      expect(res.status).toBe(400);
    });

    it('should reject prompt exceeding max length', async () => {
      const res = await request(app)
        .post('/api/ai/generate-block')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockType: 'statBlock', prompt: 'A'.repeat(2001) });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/ai/generate-block')
        .send({ blockType: 'statBlock', prompt: 'test' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/ai/autofill', () => {
    it('should return 400 when AI is not configured', async () => {
      const res = await request(app)
        .post('/api/ai/autofill')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          blockType: 'npcProfile',
          currentAttrs: { name: 'Elara', race: '', class: '' },
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('AI not configured');
    });

    it('should reject unsupported block type', async () => {
      const res = await request(app)
        .post('/api/ai/autofill')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockType: 'fakeBlock', currentAttrs: {} });

      expect(res.status).toBe(400);
    });

    it('should reject too many attributes', async () => {
      const attrs: Record<string, string> = {};
      for (let i = 0; i < 51; i++) {
        attrs[`field${i}`] = 'value';
      }
      const res = await request(app)
        .post('/api/ai/autofill')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ blockType: 'statBlock', currentAttrs: attrs });

      expect(res.status).toBe(400);
    });

    it('should return 401 without auth token', async () => {
      const res = await request(app)
        .post('/api/ai/autofill')
        .send({ blockType: 'statBlock', currentAttrs: {} });
      expect(res.status).toBe(401);
    });
  });
});
