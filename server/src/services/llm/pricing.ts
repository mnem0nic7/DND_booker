import type { AiProvider } from '../ai-provider.service.js';

export interface TokenUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
}

export interface ModelPricing {
  inputPerMillionTokensUsd: number;
  outputPerMillionTokensUsd: number;
}

const DEFAULT_PRICING: Record<string, ModelPricing> = {
  'google:gemini-2.5-pro': {
    inputPerMillionTokensUsd: 1.25,
    outputPerMillionTokensUsd: 10,
  },
  'google:gemini-2.5-flash': {
    inputPerMillionTokensUsd: 0.3,
    outputPerMillionTokensUsd: 2.5,
  },
  'google:gemini-2.5-flash-lite': {
    inputPerMillionTokensUsd: 0.075,
    outputPerMillionTokensUsd: 0.3,
  },
  'openai:gpt-4o': {
    inputPerMillionTokensUsd: 5,
    outputPerMillionTokensUsd: 15,
  },
  'openai:gpt-4o-mini': {
    inputPerMillionTokensUsd: 0.15,
    outputPerMillionTokensUsd: 0.6,
  },
  'anthropic:claude-sonnet-4-6': {
    inputPerMillionTokensUsd: 3,
    outputPerMillionTokensUsd: 15,
  },
  'anthropic:claude-haiku-4-5-20251001': {
    inputPerMillionTokensUsd: 0.25,
    outputPerMillionTokensUsd: 1.25,
  },
};

function parsePricingOverrides(): Record<string, ModelPricing> {
  const raw = process.env.LLM_PRICING_JSON?.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, Partial<ModelPricing>>;
    const entries = Object.entries(parsed).map(([key, value]) => {
      if (typeof value?.inputPerMillionTokensUsd !== 'number' || typeof value?.outputPerMillionTokensUsd !== 'number') {
        return null;
      }
      return [key.trim(), {
        inputPerMillionTokensUsd: value.inputPerMillionTokensUsd,
        outputPerMillionTokensUsd: value.outputPerMillionTokensUsd,
      }] as const;
    }).filter((entry): entry is readonly [string, ModelPricing] => entry !== null);

    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

const PRICING_OVERRIDES = parsePricingOverrides();

export function getModelPricing(provider: AiProvider, model?: string): ModelPricing | null {
  const modelId = model?.trim();
  if (!modelId) return null;

  const key = `${provider}:${modelId}`;
  return PRICING_OVERRIDES[key] ?? DEFAULT_PRICING[key] ?? null;
}

export function estimateUsageCost(
  provider: AiProvider,
  model: string | undefined,
  usage: TokenUsageLike | null | undefined,
): number | null {
  const pricing = getModelPricing(provider, model);
  if (!pricing || !usage) return null;

  const inputTokens = usage.inputTokens ?? usage.promptTokens ?? 0;
  const outputTokens = usage.outputTokens ?? usage.completionTokens ?? 0;
  const total = (inputTokens / 1_000_000) * pricing.inputPerMillionTokensUsd
    + (outputTokens / 1_000_000) * pricing.outputPerMillionTokensUsd;

  return Number.isFinite(total) ? total : null;
}
