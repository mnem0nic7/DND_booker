import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../config/database.js';
import { encryptApiKey } from '../utils/encryption.js';
import { resolveAgentModelForUser } from '../services/agent/model-resolution.service.js';

const TEST_EMAIL = 'agent-model-routing@example.com';

describe('Agent model routing', () => {
  let userId: string;

  beforeAll(async () => {
    await prisma.user.deleteMany({
      where: { email: TEST_EMAIL },
    });

    const encryptedKey = encryptApiKey('google-test-key');
    const user = await prisma.user.create({
      data: {
        email: TEST_EMAIL,
        passwordHash: 'not-used-in-test',
        displayName: 'Agent Routing Test',
        aiProvider: 'google',
        aiModel: 'gemini-3.1-flash-lite-preview',
        aiApiKeyEnc: encryptedKey.encrypted,
        aiApiKeyIv: encryptedKey.iv,
        aiApiKeyTag: encryptedKey.tag,
      },
      select: { id: true },
    });

    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: TEST_EMAIL },
    });
    await prisma.$disconnect();
  });

  it('routes structured generation agents onto stable presets instead of the raw user preview model', async () => {
    const outline = await resolveAgentModelForUser(userId, { agentKey: 'agent.outline' });
    const intake = await resolveAgentModelForUser(userId, { agentKey: 'agent.intake' });
    const draft = await resolveAgentModelForUser(userId, { agentKey: 'agent.chapter_draft' });

    expect(outline.selection.provider).toBe('google');
    expect(outline.selection.model).toBe('gemini-2.5-pro');

    expect(intake.selection.provider).toBe('google');
    expect(intake.selection.model).toBe('gemini-2.5-flash');

    expect(draft.selection.provider).toBe('google');
    expect(draft.selection.model).toBe('gemini-2.5-pro');
  });
});
