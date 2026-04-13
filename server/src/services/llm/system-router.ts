import fs from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { LanguageModel } from 'ai';
import type { QualityBudgetLane } from '@dnd-booker/shared';
import { createModel, type AiProvider } from '../ai-provider.service.js';

interface SystemCredentialConfig {
  googleEnv?: string;
  openaiEnv?: string;
  anthropicEnv?: string;
}

interface AgentLaneConfig {
  provider?: AiProvider;
  model?: string;
  baseUrl?: string;
  maxOutputTokens?: number;
}

interface AgentConfigFile {
  system?: {
    defaultProvider?: AiProvider;
    defaultBudgetLane?: QualityBudgetLane;
    credentials?: SystemCredentialConfig;
  };
  lanes?: Partial<Record<QualityBudgetLane, { defaultProvider?: AiProvider }>>;
  agents?: Record<string, Partial<Record<QualityBudgetLane, AgentLaneConfig>>>;
}

interface LoadedAgentConfig {
  system: {
    defaultProvider: AiProvider;
    defaultBudgetLane: QualityBudgetLane;
    credentials: SystemCredentialConfig;
  };
  lanes: Required<NonNullable<AgentConfigFile['lanes']>>;
  agents: Record<string, Partial<Record<QualityBudgetLane, AgentLaneConfig>>>;
}

const DEFAULT_AGENT_CONFIG: LoadedAgentConfig = {
  system: {
    defaultProvider: 'google',
    defaultBudgetLane: 'balanced',
    credentials: {
      googleEnv: 'SYSTEM_GOOGLE_API_KEY',
      openaiEnv: 'SYSTEM_OPENAI_API_KEY',
      anthropicEnv: 'SYSTEM_ANTHROPIC_API_KEY',
    },
  },
  lanes: {
    fast: { defaultProvider: 'google' },
    balanced: { defaultProvider: 'google' },
    high_quality: { defaultProvider: 'google' },
  },
  agents: {
    default: {
      fast: { provider: 'google', model: 'gemini-2.5-flash', maxOutputTokens: 8192 },
      balanced: { provider: 'google', model: 'gemini-2.5-pro', maxOutputTokens: 16384 },
      high_quality: { provider: 'google', model: 'gemini-2.5-pro', maxOutputTokens: 16384 },
    },
  },
};

export interface ResolvedSystemAgentRoute {
  provider: AiProvider;
  model?: string;
  baseUrl?: string;
  maxOutputTokens: number;
  budgetLane: QualityBudgetLane;
  agentKey: string;
  credentialEnvName: string;
}

export interface ResolvedSystemAgentModel {
  model: LanguageModel;
  maxOutputTokens: number;
  selection: ResolvedSystemAgentRoute;
}

let configCache: AgentConfigFile | null = null;

function normalizeAgentKey(agentKey?: string): string {
  const normalized = agentKey?.trim().toLowerCase();
  if (!normalized) return 'default';
  return normalized.replace(/\s+/g, '_').replace(/[^a-z0-9_.-]/g, '_');
}

function resolveCredentialEnvName(provider: AiProvider, credentials: SystemCredentialConfig) {
  if (provider === 'google') return credentials.googleEnv || 'SYSTEM_GOOGLE_API_KEY';
  if (provider === 'openai') return credentials.openaiEnv || 'SYSTEM_OPENAI_API_KEY';
  if (provider === 'anthropic') return credentials.anthropicEnv || 'SYSTEM_ANTHROPIC_API_KEY';
  throw new Error(`System-managed credentials are not supported for provider "${provider}".`);
}

async function readConfigFile(): Promise<AgentConfigFile> {
  const filePath = path.resolve(process.cwd(), 'config', 'agents.yaml');
  const file = await fs.readFile(filePath, 'utf8');
  return YAML.parse(file) as AgentConfigFile;
}

async function loadConfig(): Promise<LoadedAgentConfig> {
  if (configCache) {
    return {
      ...DEFAULT_AGENT_CONFIG,
      ...configCache,
      system: {
        ...DEFAULT_AGENT_CONFIG.system,
        ...configCache.system,
        credentials: {
          ...DEFAULT_AGENT_CONFIG.system.credentials,
          ...(configCache.system?.credentials ?? {}),
        },
      },
      lanes: {
        ...DEFAULT_AGENT_CONFIG.lanes,
        ...(configCache.lanes ?? {}),
      },
      agents: {
        ...DEFAULT_AGENT_CONFIG.agents,
        ...(configCache.agents ?? {}),
      },
    };
  }

  try {
    configCache = await readConfigFile();
  } catch {
    configCache = DEFAULT_AGENT_CONFIG;
  }

  return loadConfig();
}

export function resetSystemAgentConfigCache() {
  configCache = null;
}

export async function resolveSystemAgentRoute(agentKey: string, budgetLane: QualityBudgetLane): Promise<ResolvedSystemAgentRoute> {
  const config = await loadConfig();
  const normalizedKey = normalizeAgentKey(agentKey);
  const lane = config.lanes[budgetLane] ?? config.lanes[config.system.defaultBudgetLane];
  const defaults = config.agents.default?.[budgetLane] ?? config.agents.default?.balanced ?? {};
  const agent = config.agents[normalizedKey]?.[budgetLane] ?? config.agents[normalizedKey]?.balanced ?? {};

  const provider = agent.provider ?? defaults.provider ?? lane.defaultProvider ?? config.system.defaultProvider;
  const credentialEnvName = resolveCredentialEnvName(provider, config.system.credentials);

  return {
    provider,
    model: agent.model ?? defaults.model,
    baseUrl: agent.baseUrl ?? defaults.baseUrl,
    maxOutputTokens: agent.maxOutputTokens ?? defaults.maxOutputTokens ?? 16384,
    budgetLane,
    agentKey: normalizedKey,
    credentialEnvName,
  };
}

export async function resolveSystemAgentLanguageModel(
  agentKey: string,
  budgetLane: QualityBudgetLane = 'balanced',
): Promise<ResolvedSystemAgentModel> {
  const selection = await resolveSystemAgentRoute(agentKey, budgetLane);
  const apiKey = process.env[selection.credentialEnvName]?.trim();

  if (!apiKey) {
    throw new Error(`Missing system-managed API key env var "${selection.credentialEnvName}" for ${selection.agentKey}.`);
  }

  return {
    model: createModel(selection.provider, apiKey, selection.model, selection.baseUrl),
    maxOutputTokens: selection.maxOutputTokens,
    selection,
  };
}
