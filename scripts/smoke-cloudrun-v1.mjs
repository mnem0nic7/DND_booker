#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL ?? process.env.SERVICE_URL ?? '').trim().replace(/\/$/, '');
const email = process.env.SMOKE_TEST_EMAIL?.trim();
const password = process.env.SMOKE_TEST_PASSWORD;
const generationPrompt = process.env.SMOKE_TEST_GENERATION_PROMPT?.trim()
  || '[smoke] Create a very short D&D one-shot titled Smoke Gate with one clear hook, one location, one encounter, and one table.';
const generationTimeoutMs = Number.parseInt(process.env.SMOKE_GENERATION_TIMEOUT_MS ?? '', 10) || 25 * 60 * 1000;
const exportTimeoutMs = Number.parseInt(process.env.SMOKE_EXPORT_TIMEOUT_MS ?? '', 10) || 15 * 60 * 1000;
const pollIntervalMs = Number.parseInt(process.env.SMOKE_POLL_INTERVAL_MS ?? '', 10) || 5_000;

if (!baseUrl) {
  console.error('BASE_URL or SERVICE_URL is required for the Cloud Run smoke test.');
  process.exit(1);
}

if (!email || !password) {
  console.error('SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are required for the Cloud Run smoke test.');
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function assertOk(response, detail) {
  if (response.ok) return response;

  let body = '';
  try {
    body = await response.text();
  } catch {
    body = '';
  }
  throw new Error(`${detail} failed with ${response.status} ${response.statusText}${body ? `: ${body}` : ''}`);
}

async function getJson(response, detail) {
  await assertOk(response, detail);
  return response.json();
}

async function apiJson(path, { method = 'GET', token, body, headers = {} } = {}, detail = path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  return getJson(response, detail);
}

async function pollUntil(callback, { timeoutMs, intervalMs, label }) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await callback();
    if (result.done) {
      return result.value;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label} after ${Math.round(timeoutMs / 1000)}s`);
}

async function main() {
  let projectId = null;
  let generationRunId = null;
  let exportJobId = null;

  const loginData = await apiJson('/api/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  }, 'login');

  if (!loginData.accessToken) {
    throw new Error('login succeeded but no access token was returned');
  }

  const token = loginData.accessToken;
  const tempProjectTitle = `Smoke Accept ${new Date().toISOString().replace(/[:.]/g, '-')}`;

  try {
    const project = await apiJson('/api/v1/projects', {
      method: 'POST',
      token,
      body: {
        title: tempProjectTitle,
        description: 'Temporary acceptance project created by deploy smoke.',
        type: 'one_shot',
      },
    }, 'create temp project');
    projectId = project.id;

    const documents = await apiJson(`/api/v1/projects/${projectId}/documents`, {
      token,
    }, 'list temp project documents');
    if (!Array.isArray(documents) || documents.length === 0) {
      throw new Error('temp project did not materialize any publication documents');
    }

    const createdRun = await apiJson(`/api/v1/projects/${projectId}/generation-runs`, {
      method: 'POST',
      token,
      body: {
        prompt: generationPrompt,
        mode: 'one_shot',
        quality: 'quick',
        pageTarget: 4,
      },
    }, 'create generation run');
    generationRunId = createdRun.id;

    const pendingInterrupt = await pollUntil(async () => {
      const run = await apiJson(`/api/v1/projects/${projectId}/generation-runs/${generationRunId}`, {
        token,
      }, 'poll generation run');

      if (run.status === 'failed') {
        throw new Error(`generation run failed: ${run.failureReason ?? 'unknown failure'}`);
      }
      if (run.status === 'cancelled') {
        throw new Error('generation run was cancelled before acceptance completed');
      }

      const interrupts = await apiJson(`/api/v1/projects/${projectId}/generation-runs/${generationRunId}/interrupts`, {
        token,
      }, 'list generation run interrupts');
      const publicationReview = Array.isArray(interrupts)
        ? interrupts.find((interrupt) => interrupt.status === 'pending' && interrupt.kind === 'manual_review')
        : null;

      return publicationReview
        ? { done: true, value: publicationReview }
        : { done: false };
    }, {
      timeoutMs: generationTimeoutMs,
      intervalMs: pollIntervalMs,
      label: 'publication-review interrupt',
    });

    await apiJson(
      `/api/v1/projects/${projectId}/generation-runs/${generationRunId}/interrupts/${pendingInterrupt.id}/resolve`,
      {
        method: 'POST',
        token,
        body: { action: 'approve' },
      },
      'approve publication-review interrupt',
    );

    await apiJson(
      `/api/v1/projects/${projectId}/generation-runs/${generationRunId}/resume`,
      {
        method: 'POST',
        token,
      },
      'resume generation run after approval',
    );

    const completedRun = await pollUntil(async () => {
      const run = await apiJson(`/api/v1/projects/${projectId}/generation-runs/${generationRunId}`, {
        token,
      }, 'poll resumed generation run');

      if (run.status === 'failed') {
        throw new Error(`generation run failed after approval: ${run.failureReason ?? 'unknown failure'}`);
      }
      if (run.status === 'cancelled') {
        throw new Error('generation run was cancelled after approval');
      }

      return run.status === 'completed'
        ? { done: true, value: run }
        : { done: false };
    }, {
      timeoutMs: generationTimeoutMs,
      intervalMs: pollIntervalMs,
      label: 'generation run completion',
    });

    const exportJob = await apiJson(`/api/v1/projects/${projectId}/export-jobs`, {
      method: 'POST',
      token,
      body: { format: 'pdf' },
    }, 'create export job');
    exportJobId = exportJob.id;

    const completedExport = await pollUntil(async () => {
      const job = await apiJson(`/api/v1/export-jobs/${exportJobId}`, {
        token,
      }, 'poll export job');

      if (job.status === 'failed') {
        throw new Error(`export job failed: ${job.errorMessage ?? 'unknown failure'}`);
      }

      return job.status === 'completed'
        ? { done: true, value: job }
        : { done: false };
    }, {
      timeoutMs: exportTimeoutMs,
      intervalMs: pollIntervalMs,
      label: 'export completion',
    });

    const downloadResponse = await fetch(`${baseUrl}/api/v1/export-jobs/${exportJobId}/download`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    await assertOk(downloadResponse, 'download export PDF');
    const pdfBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    if (pdfBuffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('downloaded export did not look like a PDF');
    }

    console.log(JSON.stringify({
      ok: true,
      projectId,
      generationRunId,
      generationRunStatus: completedRun.status,
      exportJobId,
      exportJobStatus: completedExport.status,
      pdfBytes: pdfBuffer.length,
    }));
  } finally {
    if (projectId) {
      try {
        const response = await fetch(`${baseUrl}/api/v1/projects/${projectId}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!response.ok && response.status !== 404) {
          const body = await response.text().catch(() => '');
          console.error(`[smoke-cloudrun-v1] cleanup failed for project ${projectId}: ${response.status} ${body}`);
        }
      } catch (error) {
        console.error(`[smoke-cloudrun-v1] cleanup error for project ${projectId}:`, error instanceof Error ? error.message : error);
      }
    }
  }
}

main().catch((error) => {
  console.error('[smoke-cloudrun-v1]', error instanceof Error ? error.message : error);
  process.exit(1);
});
