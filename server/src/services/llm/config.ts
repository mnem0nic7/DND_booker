import type { AiProvider } from '../ai-provider.service.js';

export interface ModelRouteConfig {
  provider: AiProvider;
  model?: string;
  baseUrl?: string;
}

export interface ModelRouteLayers {
  system?: ModelRouteConfig;
  project?: Partial<ModelRouteConfig> | null;
  user?: Partial<ModelRouteConfig> | null;
  agent?: Partial<ModelRouteConfig> | null;
}

export interface ResolvedModelRoute extends ModelRouteConfig {
  source: 'system' | 'project' | 'user' | 'agent';
  agentKey?: string;
  projectId?: string;
  userId?: string;
}

type AgentPresetMap = Partial<Record<AiProvider, Partial<ModelRouteConfig>>> & {
  default?: Partial<ModelRouteConfig>;
};

const DEFAULT_SYSTEM_ROUTE: ModelRouteConfig = {
  provider: 'google',
  model: 'gemini-2.5-pro',
};

export const AGENT_MODEL_PRESETS: Record<string, AgentPresetMap> = {
  default: {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.intake': {
    google: {
      model: 'gemini-2.5-flash',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-haiku-4-5-20251001',
    },
  },
  'agent.bible': {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.outline': {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.canon': {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.chapter_plan': {
    google: {
      model: 'gemini-2.5-flash',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-haiku-4-5-20251001',
    },
  },
  'agent.chapter_draft': {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.evaluator': {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.reviser': {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.assembler': {
    google: {
      model: 'gemini-2.5-flash-lite',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-haiku-4-5-20251001',
    },
  },
  'agent.layout': {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.random_table_expansion': {
    google: {
      model: 'gemini-2.5-flash',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-haiku-4-5-20251001',
    },
  },
  'agent.stat_block_repair': {
    google: {
      model: 'gemini-2.5-pro',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-sonnet-4-6',
    },
  },
  'agent.utility_densifier': {
    google: {
      model: 'gemini-2.5-flash',
    },
    openai: {
      model: 'gpt-4o-mini',
    },
    anthropic: {
      model: 'claude-haiku-4-5-20251001',
    },
  },
};

export function normalizeAgentKey(agentKey?: string): string {
  const normalized = agentKey?.trim().toLowerCase();
  if (!normalized) return 'default';
  return normalized.replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '_');
}

export function getAgentPreset(agentKey?: string, provider?: AiProvider): Partial<ModelRouteConfig> | null {
  const normalized = normalizeAgentKey(agentKey);
  const preset = AGENT_MODEL_PRESETS[normalized] ?? AGENT_MODEL_PRESETS.default ?? null;
  if (!preset) return null;
  if (!provider) {
    return preset.default ?? null;
  }
  return preset[provider] ?? preset.default ?? null;
}

export function mergeModelRouteLayers(layers: ModelRouteLayers): ResolvedModelRoute {
  const merged: ModelRouteConfig = {
    ...DEFAULT_SYSTEM_ROUTE,
    ...(layers.system ?? {}),
  };

  if (layers.project) {
    if (layers.project.provider) merged.provider = layers.project.provider;
    if (layers.project.model !== undefined) merged.model = layers.project.model;
    if (layers.project.baseUrl !== undefined) merged.baseUrl = layers.project.baseUrl;
  }

  if (layers.user) {
    if (layers.user.provider) merged.provider = layers.user.provider;
    if (layers.user.model !== undefined) merged.model = layers.user.model;
    if (layers.user.baseUrl !== undefined) merged.baseUrl = layers.user.baseUrl;
  }

  if (layers.agent) {
    if (layers.agent.provider) merged.provider = layers.agent.provider;
    if (layers.agent.model !== undefined) merged.model = layers.agent.model;
    if (layers.agent.baseUrl !== undefined) merged.baseUrl = layers.agent.baseUrl;
  }

  return {
    ...merged,
    source: layers.agent ? 'agent' : layers.user ? 'user' : layers.project ? 'project' : 'system',
  };
}
