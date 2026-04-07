import type { LanguageModel } from 'ai';
import { createModel } from '../ai-provider.service.js';
import { getAiSettings, getDecryptedApiKey } from '../ai-settings.service.js';
import { getAgentPreset, mergeModelRouteLayers, type ModelRouteConfig, type ResolvedModelRoute } from './config.js';

export interface ResolveAgentModelInput {
  userId: string;
  agentKey?: string;
  projectId?: string;
  projectOverride?: Partial<ModelRouteConfig> | null;
  userOverride?: Partial<ModelRouteConfig> | null;
  agentOverride?: Partial<ModelRouteConfig> | null;
}

export interface ResolvedAgentModel {
  model: LanguageModel;
  maxOutputTokens: number;
  selection: ResolvedModelRoute;
}

function normalizeUserSettingsRoute(settings: Awaited<ReturnType<typeof getAiSettings>>): Partial<ModelRouteConfig> | null {
  if (!settings?.provider) return null;
  return {
    provider: settings.provider,
    model: settings.model ?? undefined,
    baseUrl: settings.baseUrl ?? undefined,
  };
}

export async function resolveAgentLanguageModel(input: ResolveAgentModelInput): Promise<ResolvedAgentModel> {
  const settings = await getAiSettings(input.userId);
  if (!settings?.provider) {
    throw new Error('AI not configured for user');
  }

  const selection = mergeModelRouteLayers({
    project: input.projectOverride ?? null,
    user: input.userOverride ?? normalizeUserSettingsRoute(settings),
    agent: input.agentOverride ?? getAgentPreset(input.agentKey, settings.provider) ?? undefined,
  });

  const hasSelectableProvider = settings.provider === selection.provider || selection.provider === 'ollama';
  if (!hasSelectableProvider) {
    throw new Error(`AI settings are configured for ${settings.provider}, but routing selected ${selection.provider}.`);
  }

  const maxOutputTokens = selection.provider === 'ollama' ? 1024 : 16_384;

  if (selection.provider === 'ollama') {
    const model = createModel(
      selection.provider,
      'ollama',
      selection.model,
      selection.baseUrl ?? settings.baseUrl ?? undefined,
    );
    return { model, maxOutputTokens, selection };
  }

  const apiKey = await getDecryptedApiKey(input.userId);
  if (!apiKey) {
    throw new Error('Failed to decrypt API key');
  }

  const model = createModel(
    selection.provider,
    apiKey,
    selection.model,
    selection.baseUrl ?? settings.baseUrl ?? undefined,
  );

  return { model, maxOutputTokens, selection };
}
