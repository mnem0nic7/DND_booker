export interface QueueDispatchOverrides {
  attempts?: number;
  priority?: number;
  backoffDelayMs?: number;
  removeOnCompleteAgeSeconds?: number;
  removeOnFailAgeSeconds?: number;
}

export interface ResolvedQueueDispatchOptions {
  attempts: number;
  priority: number;
  backoff: {
    type: 'exponential';
    delay: number;
  } | undefined;
  removeOnComplete: {
    age: number;
  };
  removeOnFail: {
    age: number;
  };
}

interface QueueDefaults {
  attempts: number;
  priority: number;
  backoffDelayMs: number;
  removeOnCompleteAgeSeconds: number;
  removeOnFailAgeSeconds: number;
}

const QUEUE_DEFAULTS: Record<'generation' | 'agent' | 'export', QueueDefaults> = {
  generation: {
    attempts: 3,
    priority: 20,
    backoffDelayMs: 2500,
    removeOnCompleteAgeSeconds: 86_400,
    removeOnFailAgeSeconds: 604_800,
  },
  agent: {
    attempts: 3,
    priority: 30,
    backoffDelayMs: 2500,
    removeOnCompleteAgeSeconds: 86_400,
    removeOnFailAgeSeconds: 604_800,
  },
  export: {
    attempts: 3,
    priority: 40,
    backoffDelayMs: 2000,
    removeOnCompleteAgeSeconds: 86_400,
    removeOnFailAgeSeconds: 604_800,
  },
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveQueueDispatchOptions(
  queueName: 'generation' | 'agent' | 'export',
  overrides: QueueDispatchOverrides = {},
): ResolvedQueueDispatchOptions {
  const defaults = QUEUE_DEFAULTS[queueName];

  const attempts = parsePositiveInt(
    process.env[`${queueName.toUpperCase()}_QUEUE_ATTEMPTS`],
    overrides.attempts ?? defaults.attempts,
  );
  const priority = parsePositiveInt(
    process.env[`${queueName.toUpperCase()}_QUEUE_PRIORITY`],
    overrides.priority ?? defaults.priority,
  );
  const backoffDelayMs = parsePositiveInt(
    process.env[`${queueName.toUpperCase()}_QUEUE_BACKOFF_DELAY_MS`],
    overrides.backoffDelayMs ?? defaults.backoffDelayMs,
  );
  const removeOnCompleteAgeSeconds = parsePositiveInt(
    process.env[`${queueName.toUpperCase()}_QUEUE_REMOVE_ON_COMPLETE_AGE_SECONDS`],
    overrides.removeOnCompleteAgeSeconds ?? defaults.removeOnCompleteAgeSeconds,
  );
  const removeOnFailAgeSeconds = parsePositiveInt(
    process.env[`${queueName.toUpperCase()}_QUEUE_REMOVE_ON_FAIL_AGE_SECONDS`],
    overrides.removeOnFailAgeSeconds ?? defaults.removeOnFailAgeSeconds,
  );

  return {
    attempts,
    priority,
    backoff: attempts > 1
      ? {
        type: 'exponential',
        delay: backoffDelayMs,
      }
      : undefined,
    removeOnComplete: {
      age: removeOnCompleteAgeSeconds,
    },
    removeOnFail: {
      age: removeOnFailAgeSeconds,
    },
  };
}
