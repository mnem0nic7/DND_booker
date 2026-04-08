import { prisma } from '../../server/src/config/database.js';

type RunType = 'generation' | 'agent';

interface PendingInterruptSummary {
  runType: RunType;
  runId: string;
  projectId: string;
  interruptId: string;
  kind: string;
  title: string;
  createdAt: string;
  ageMinutes: number;
}

export interface RuntimeAuditSummary {
  generatedAt: string;
  queuedGenerationRuns: number;
  queuedAgentRuns: number;
  queuedExportJobs: number;
  stalePendingInterrupts: number;
  violations: string[];
  pendingInterrupts: PendingInterruptSummary[];
}

interface RuntimeAuditThresholds {
  queuedGenerationMinutes: number;
  queuedAgentMinutes: number;
  queuedExportMinutes: number;
  pendingInterruptMinutes: number;
}

interface RuntimeAuditConfig extends RuntimeAuditThresholds {
  enabled: boolean;
  intervalMs: number;
  forceFail: boolean;
}

interface PendingInterruptRecord {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
}

function parsePositiveInt(raw: string | undefined, fallback: number) {
  const parsed = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parsePendingInterrupts(graphStateJson: unknown): PendingInterruptRecord[] {
  if (!isRecord(graphStateJson) || !Array.isArray(graphStateJson.interrupts)) {
    return [];
  }

  return graphStateJson.interrupts
    .map((interrupt) => {
      if (!isRecord(interrupt)) return null;
      if (interrupt.status !== 'pending') return null;
      if (typeof interrupt.id !== 'string' || typeof interrupt.createdAt !== 'string') return null;
      return {
        id: interrupt.id,
        kind: typeof interrupt.kind === 'string' ? interrupt.kind : 'manual_review',
        title: typeof interrupt.title === 'string' ? interrupt.title : 'manual review',
        createdAt: interrupt.createdAt,
      } satisfies PendingInterruptRecord;
    })
    .filter((interrupt): interrupt is PendingInterruptRecord => Boolean(interrupt));
}

function minutesSince(isoTimestamp: string, now = Date.now()) {
  return Math.floor((now - new Date(isoTimestamp).getTime()) / 60_000);
}

export function resolveRuntimeAuditConfig(env = process.env): RuntimeAuditConfig {
  return {
    enabled: env.OPS_AUDIT_ENABLED !== 'false',
    intervalMs: parsePositiveInt(env.OPS_AUDIT_INTERVAL_MS, 5 * 60 * 1000),
    queuedGenerationMinutes: parsePositiveInt(env.OPS_AUDIT_STALE_GENERATION_MINUTES, 15),
    queuedAgentMinutes: parsePositiveInt(env.OPS_AUDIT_STALE_AGENT_MINUTES, 15),
    queuedExportMinutes: parsePositiveInt(env.OPS_AUDIT_STALE_EXPORT_MINUTES, 15),
    pendingInterruptMinutes: parsePositiveInt(env.OPS_AUDIT_PENDING_INTERRUPT_MINUTES, 20),
    forceFail: env.OPS_AUDIT_FORCE_FAIL === '1',
  };
}

export async function runRuntimeAudit(
  thresholds: RuntimeAuditThresholds = resolveRuntimeAuditConfig(),
): Promise<RuntimeAuditSummary> {
  const now = new Date();
  const generationCutoff = new Date(now.getTime() - thresholds.queuedGenerationMinutes * 60_000);
  const agentCutoff = new Date(now.getTime() - thresholds.queuedAgentMinutes * 60_000);
  const exportCutoff = new Date(now.getTime() - thresholds.queuedExportMinutes * 60_000);
  const interruptCutoff = new Date(now.getTime() - thresholds.pendingInterruptMinutes * 60_000);

  const [queuedGenerationRuns, queuedAgentRuns, queuedExportJobs, generationInterruptRuns, agentInterruptRuns] =
    await Promise.all([
      prisma.generationRun.count({
        where: {
          status: 'queued',
          createdAt: { lt: generationCutoff },
        },
      }),
      prisma.agentRun.count({
        where: {
          status: 'queued',
          createdAt: { lt: agentCutoff },
        },
      }),
      prisma.exportJob.count({
        where: {
          status: { in: ['queued', 'processing'] },
          createdAt: { lt: exportCutoff },
        },
      }),
      prisma.generationRun.findMany({
        where: {
          updatedAt: { lt: interruptCutoff },
        },
        select: {
          id: true,
          projectId: true,
          graphStateJson: true,
        },
      }),
      prisma.agentRun.findMany({
        where: {
          updatedAt: { lt: interruptCutoff },
        },
        select: {
          id: true,
          projectId: true,
          graphStateJson: true,
        },
      }),
    ]);

  const nowMs = now.getTime();
  const pendingInterrupts: PendingInterruptSummary[] = [
    ...generationInterruptRuns.flatMap((run) =>
      parsePendingInterrupts(run.graphStateJson).map((interrupt) => ({
        runType: 'generation' as const,
        runId: run.id,
        projectId: run.projectId,
        interruptId: interrupt.id,
        kind: interrupt.kind,
        title: interrupt.title,
        createdAt: interrupt.createdAt,
        ageMinutes: minutesSince(interrupt.createdAt, nowMs),
      })),
    ),
    ...agentInterruptRuns.flatMap((run) =>
      parsePendingInterrupts(run.graphStateJson).map((interrupt) => ({
        runType: 'agent' as const,
        runId: run.id,
        projectId: run.projectId,
        interruptId: interrupt.id,
        kind: interrupt.kind,
        title: interrupt.title,
        createdAt: interrupt.createdAt,
        ageMinutes: minutesSince(interrupt.createdAt, nowMs),
      })),
    ),
  ].sort((left, right) => right.ageMinutes - left.ageMinutes);

  const violations: string[] = [];
  if (queuedGenerationRuns > 0) {
    violations.push(`stale queued generation runs: ${queuedGenerationRuns}`);
  }
  if (queuedAgentRuns > 0) {
    violations.push(`stale queued agent runs: ${queuedAgentRuns}`);
  }
  if (queuedExportJobs > 0) {
    violations.push(`stale queued export jobs: ${queuedExportJobs}`);
  }
  if (pendingInterrupts.length > 0) {
    violations.push(`stale pending interrupts: ${pendingInterrupts.length}`);
  }

  return {
    generatedAt: now.toISOString(),
    queuedGenerationRuns,
    queuedAgentRuns,
    queuedExportJobs,
    stalePendingInterrupts: pendingInterrupts.length,
    violations,
    pendingInterrupts,
  };
}

export function formatRuntimeAuditFingerprint(summary: RuntimeAuditSummary) {
  return JSON.stringify({
    queuedGenerationRuns: summary.queuedGenerationRuns,
    queuedAgentRuns: summary.queuedAgentRuns,
    queuedExportJobs: summary.queuedExportJobs,
    stalePendingInterrupts: summary.stalePendingInterrupts,
    pendingInterruptIds: summary.pendingInterrupts.map((interrupt) => interrupt.interruptId),
  });
}

export function startRuntimeAuditLoop(config = resolveRuntimeAuditConfig()) {
  if (!config.enabled) {
    console.info('[ops.audit] disabled');
    return () => {};
  }

  let lastViolationFingerprint: string | null = null;
  let stopped = false;
  let timer: NodeJS.Timeout | null = null;

  const runOnce = async () => {
    if (stopped) return;

    try {
      const summary = await runRuntimeAudit(config);
      if (config.forceFail) {
        summary.violations.push('forced audit failure for validation');
      }

      const fingerprint = formatRuntimeAuditFingerprint(summary);
      if (summary.violations.length > 0 || config.forceFail) {
        if (fingerprint !== lastViolationFingerprint || config.forceFail) {
          console.error('[ops.audit] OPS_AUDIT_VIOLATION', JSON.stringify(summary));
        }
        lastViolationFingerprint = fingerprint;
      } else if (lastViolationFingerprint !== null) {
        console.info('[ops.audit] OPS_AUDIT_RECOVERED', JSON.stringify(summary));
        lastViolationFingerprint = null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[ops.audit] OPS_AUDIT_ERROR', message);
    } finally {
      if (!stopped) {
        timer = setTimeout(() => {
          void runOnce();
        }, config.intervalMs);
        timer.unref();
      }
    }
  };

  void runOnce();

  return () => {
    stopped = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
