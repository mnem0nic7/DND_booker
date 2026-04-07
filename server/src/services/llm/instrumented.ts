import { performance } from 'node:perf_hooks';
import { generateObject, generateText, streamText } from 'ai';
import type { AiProvider } from '../ai-provider.service.js';
import { estimateUsageCost, type TokenUsageLike } from './pricing.js';

export interface InstrumentedLlmCallMeta {
  operation: string;
  provider: AiProvider;
  model?: string;
  agentKey?: string;
  userId?: string;
  projectId?: string;
  runId?: string;
}

export interface InstrumentedLlmCallRecord extends InstrumentedLlmCallMeta {
  durationMs: number;
  estimatedCostUsd: number | null;
  usage: TokenUsageLike | null;
  status: 'completed' | 'failed';
}

function recordTelemetry(record: InstrumentedLlmCallRecord) {
  if (process.env.LLM_RUNTIME_DEBUG !== '1') return;
  const cost = record.estimatedCostUsd === null ? 'n/a' : `$${record.estimatedCostUsd.toFixed(6)}`;
  console.info(
    `[LLM] ${record.status} ${record.operation} provider=${record.provider} model=${record.model ?? 'unknown'} durationMs=${Math.round(record.durationMs)} cost=${cost}`,
  );
}

function extractUsage(result: { usage?: TokenUsageLike } | null | undefined): TokenUsageLike | null {
  return result?.usage ?? null;
}

async function wrapLlmCall<T>(
  meta: InstrumentedLlmCallMeta,
  executor: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await executor();
    const durationMs = performance.now() - startedAt;
    const usage = extractUsage(result as { usage?: TokenUsageLike } | null | undefined);
    const estimatedCostUsd = estimateUsageCost(meta.provider, meta.model, usage);

    recordTelemetry({
      ...meta,
      durationMs,
      estimatedCostUsd,
      usage,
      status: 'completed',
    });

    return result;
  } catch (error) {
    const durationMs = performance.now() - startedAt;
    recordTelemetry({
      ...meta,
      durationMs,
      estimatedCostUsd: null,
      usage: null,
      status: 'failed',
    });
    throw error;
  }
}

export async function instrumentedGenerateText(
  meta: InstrumentedLlmCallMeta,
  options: Parameters<typeof generateText>[0],
): Promise<any> {
  return wrapLlmCall(meta, () => generateText(options));
}

export async function instrumentedGenerateObject(
  meta: InstrumentedLlmCallMeta,
  options: Parameters<typeof generateObject>[0],
): Promise<any> {
  return wrapLlmCall(meta, () => generateObject(options));
}

export function instrumentedStreamText(
  meta: InstrumentedLlmCallMeta,
  options: Parameters<typeof streamText>[0],
): any {
  if (process.env.LLM_RUNTIME_DEBUG === '1') {
    console.info(
      `[LLM] stream started ${meta.operation} provider=${meta.provider} model=${meta.model ?? 'unknown'}`,
    );
  }

  return streamText(options);
}
