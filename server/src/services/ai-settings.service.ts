import { prisma } from '../config/database.js';
import { encryptApiKey, decryptApiKey } from '../utils/encryption.js';
import type { AiProvider } from './ai-provider.service.js';

export async function saveAiSettings(
  userId: string,
  data: { provider: AiProvider; model: string; apiKey?: string; baseUrl?: string },
) {
  const update: Record<string, string | null> = {
    aiProvider: data.provider,
    aiModel: data.model,
    aiBaseUrl: data.baseUrl ?? null,
  };

  if (data.apiKey) {
    const { encrypted, iv, tag } = encryptApiKey(data.apiKey);
    update.aiApiKeyEnc = encrypted;
    update.aiApiKeyIv = iv;
    update.aiApiKeyTag = tag;
  }

  // Ollama doesn't need an API key — clear any stale one when switching
  if (data.provider === 'ollama' && !data.apiKey) {
    update.aiApiKeyEnc = null;
    update.aiApiKeyIv = null;
    update.aiApiKeyTag = null;
  }

  await prisma.user.update({
    where: { id: userId },
    data: update,
  });
}

export async function getAiSettings(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiProvider: true,
      aiModel: true,
      aiApiKeyEnc: true,
      aiBaseUrl: true,
    },
  });

  if (!user) return null;

  return {
    provider: user.aiProvider as AiProvider | null,
    model: user.aiModel,
    hasApiKey: !!user.aiApiKeyEnc,
    baseUrl: user.aiBaseUrl,
  };
}

export async function getDecryptedApiKey(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      aiApiKeyEnc: true,
      aiApiKeyIv: true,
      aiApiKeyTag: true,
    },
  });

  if (!user?.aiApiKeyEnc || !user.aiApiKeyIv || !user.aiApiKeyTag) {
    return null;
  }

  try {
    return decryptApiKey(user.aiApiKeyEnc, user.aiApiKeyIv, user.aiApiKeyTag);
  } catch (err) {
    console.error('[AI] Failed to decrypt API key for user', userId, '— key may need re-entry:', err);
    return null;
  }
}

export async function removeApiKey(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: {
      aiApiKeyEnc: null,
      aiApiKeyIv: null,
      aiApiKeyTag: null,
    },
  });
}
