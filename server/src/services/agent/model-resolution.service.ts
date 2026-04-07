import type { LanguageModel } from 'ai';
import { resolveAgentLanguageModel } from '../llm/router.js';

export async function resolveAgentModelForUser(
  userId: string,
  options: {
    agentKey?: string;
    projectId?: string;
  } = {},
): Promise<{
  model: LanguageModel;
  maxOutputTokens: number;
  selection: Awaited<ReturnType<typeof resolveAgentLanguageModel>>['selection'];
}> {
  const resolved = await resolveAgentLanguageModel({
    userId,
    agentKey: options.agentKey,
    projectId: options.projectId,
  });

  return resolved;
}
