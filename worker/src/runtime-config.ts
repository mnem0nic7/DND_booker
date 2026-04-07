function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveWorkerConcurrency(name: string, fallback: number): number {
  const envKey = `WORKER_${name.toUpperCase()}_CONCURRENCY`;
  return parsePositiveInt(process.env[envKey], fallback);
}

export function resolveWorkerTiming() {
  return {
    longRunningJobLockMs: parsePositiveInt(process.env.WORKER_LONG_RUNNING_JOB_LOCK_MS, 15 * 60 * 1000),
    stalledCheckIntervalMs: parsePositiveInt(process.env.WORKER_STALLED_CHECK_INTERVAL_MS, 60 * 1000),
  };
}
