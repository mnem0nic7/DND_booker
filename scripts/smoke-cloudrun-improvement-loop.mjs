#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL ?? process.env.SERVICE_URL ?? '').trim().replace(/\/$/, '');
const email = process.env.SMOKE_TEST_EMAIL?.trim();
const password = process.env.SMOKE_TEST_PASSWORD;
const requestedRepositoryFullName = process.env.SMOKE_IMPROVEMENT_LOOP_REPOSITORY_FULL_NAME?.trim();
const requestedDefaultBranch = process.env.SMOKE_IMPROVEMENT_LOOP_DEFAULT_BRANCH?.trim();
const requestedAllowlist = process.env.SMOKE_IMPROVEMENT_LOOP_ALLOWLIST?.trim();
const hasEngineeringAutomationEnv = process.env.SMOKE_IMPROVEMENT_LOOP_ENGINEERING_AUTOMATION_ENABLED !== undefined;
const hasInstallationIdEnv = process.env.SMOKE_IMPROVEMENT_LOOP_INSTALLATION_ID !== undefined;
const requestedEngineeringAutomationEnabled = !/^(0|false|no)$/i.test(
  process.env.SMOKE_IMPROVEMENT_LOOP_ENGINEERING_AUTOMATION_ENABLED ?? 'true',
);
const projectTitle = process.env.SMOKE_IMPROVEMENT_LOOP_PROJECT_TITLE?.trim()
  || `Smoke Improvement Loop ${new Date().toISOString().replace(/[:.]/g, '-')}`;
const prompt = process.env.SMOKE_IMPROVEMENT_LOOP_PROMPT?.trim()
  || '[smoke] Create a compact campaign with one starting town, one villain, one dungeon, one faction table, and practical GM-facing utility.';
const objective = process.env.SMOKE_IMPROVEMENT_LOOP_OBJECTIVE?.trim()
  || 'Run the creator, designer, editor, and engineering loop and produce a final report.';
const generationMode = process.env.SMOKE_IMPROVEMENT_LOOP_GENERATION_MODE?.trim() || 'campaign';
const generationQuality = process.env.SMOKE_IMPROVEMENT_LOOP_GENERATION_QUALITY?.trim() || 'quick';
const pollIntervalMs = Number.parseInt(process.env.SMOKE_IMPROVEMENT_LOOP_POLL_INTERVAL_MS ?? '', 10) || 10_000;
const timeoutMs = Number.parseInt(process.env.SMOKE_IMPROVEMENT_LOOP_TIMEOUT_MS ?? '', 10) || 60 * 60 * 1000;
const expectApply = /^(1|true|yes)$/i.test(process.env.SMOKE_IMPROVEMENT_LOOP_EXPECT_APPLY ?? '');

const REQUIRED_ARTIFACT_TYPES = [
  'creator_report',
  'designer_ux_notes',
  'editor_final_report',
  'engineering_report',
  'engineering_apply_result',
];

let currentAccessToken = null;

if (!baseUrl) {
  console.error('BASE_URL or SERVICE_URL is required for the Cloud Run improvement-loop smoke test.');
  process.exit(1);
}

if (!email || !password) {
  console.error('SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are required for the Cloud Run improvement-loop smoke test.');
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

async function login(detail = 'login') {
  const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const data = await getJson(response, detail);
  currentAccessToken = data.accessToken;
  return data;
}

async function apiJson(
  path,
  { method = 'GET', token, body, headers = {} } = {},
  detail = path,
  allowRelogin = true,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...((token ?? currentAccessToken) ? { Authorization: `Bearer ${token ?? currentAccessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && allowRelogin && !token) {
    await login('re-login after expired smoke token');
    return apiJson(path, { method, body, headers }, detail, false);
  }

  return getJson(response, detail);
}

async function fetchWithAuth(
  path,
  { method = 'GET', headers = {}, body } = {},
  detail = path,
  allowRelogin = true,
  allowNotFound = false,
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(currentAccessToken ? { Authorization: `Bearer ${currentAccessToken}` } : {}),
      ...headers,
    },
    body,
  });

  if (response.status === 401 && allowRelogin) {
    await login('re-login before authenticated fetch');
    return fetchWithAuth(path, { method, headers, body }, detail, false, allowNotFound);
  }

  if (allowNotFound && response.status === 404) {
    return response;
  }

  await assertOk(response, detail);
  return response;
}

async function pollUntil(callback, { timeoutMs: maxWaitMs, intervalMs, label }) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    const result = await callback();
    if (result.done) {
      return result.value;
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for ${label} after ${Math.round(maxWaitMs / 1000)}s`);
}

function assertArtifactCoverage(artifacts) {
  const seenTypes = new Set(Array.isArray(artifacts) ? artifacts.map((artifact) => artifact.artifactType) : []);
  const missing = REQUIRED_ARTIFACT_TYPES.filter((artifactType) => !seenTypes.has(artifactType));
  if (missing.length > 0) {
    throw new Error(`Improvement loop did not produce required artifact types: ${missing.join(', ')}`);
  }
}

async function main() {
  let projectId = null;
  let runId = null;

  await login();

  let repositoryFullName = requestedRepositoryFullName ?? '';
  let engineeringAutomationEnabled = requestedEngineeringAutomationEnabled;
  let installationId = Number.parseInt(
    process.env.SMOKE_IMPROVEMENT_LOOP_INSTALLATION_ID ?? (engineeringAutomationEnabled ? '' : '1'),
    10,
  );
  let defaultBranch = requestedDefaultBranch || 'main';
  let allowlist = (requestedAllowlist || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (!repositoryFullName || !Number.isInteger(installationId) || installationId <= 0 || allowlist.length === 0 || !requestedDefaultBranch || !hasEngineeringAutomationEnv) {
    const defaultTarget = await apiJson(
      '/api/v1/improvement-loops/default-engineering-target',
      {},
      'load default improvement-loop engineering target',
    );

    if (!repositoryFullName) repositoryFullName = defaultTarget.repositoryFullName;
    if (!Number.isInteger(installationId) || installationId <= 0) installationId = defaultTarget.installationId;
    if (!requestedDefaultBranch) defaultBranch = defaultTarget.defaultBranch;
    if (allowlist.length === 0) allowlist = defaultTarget.pathAllowlist;
    if (!hasEngineeringAutomationEnv) engineeringAutomationEnabled = defaultTarget.engineeringAutomationEnabled;
  }

  if (!repositoryFullName || !Number.isInteger(installationId) || installationId <= 0) {
    throw new Error('A repository full name and a positive installation id are required for the Cloud Run improvement-loop smoke test.');
  }

  try {
    const run = await apiJson('/api/v1/improvement-loops', {
      method: 'POST',
      body: {
        projectTitle,
        prompt,
        objective,
        generationMode,
        generationQuality,
        repoBinding: {
          repositoryFullName,
          installationId,
          defaultBranch,
          pathAllowlist: allowlist,
          engineeringAutomationEnabled,
        },
      },
    }, 'create improvement loop and project');

    projectId = run.projectId;
    runId = run.id;

    const completedRun = await pollUntil(async () => {
      const latest = await apiJson(
        `/api/v1/projects/${projectId}/improvement-loops/${runId}`,
        {},
        'poll improvement loop',
      );

      if (latest.status === 'failed') {
        throw new Error(`improvement loop failed: ${latest.failureReason ?? 'unknown failure'}`);
      }
      if (latest.status === 'cancelled') {
        throw new Error('improvement loop was cancelled before smoke completed');
      }

      return latest.status === 'completed'
        ? { done: true, value: latest }
        : { done: false };
    }, {
      timeoutMs,
      intervalMs: pollIntervalMs,
      label: 'improvement loop completion',
    });

    const artifacts = await apiJson(
      `/api/v1/projects/${projectId}/improvement-loops/${runId}/artifacts`,
      {},
      'list improvement loop artifacts',
    );
    assertArtifactCoverage(artifacts);

    if (!completedRun.editorFinalReport) {
      throw new Error('completed improvement loop is missing editorFinalReport');
    }
    if (!completedRun.engineeringApplyResult) {
      throw new Error('completed improvement loop is missing engineeringApplyResult');
    }
    if (completedRun.engineeringApplyResult.status === 'failed') {
      throw new Error(`engineering stage failed: ${completedRun.engineeringApplyResult.message}`);
    }
    if (expectApply && completedRun.engineeringApplyResult.status !== 'applied') {
      throw new Error(`expected engineering auto-apply, but got status ${completedRun.engineeringApplyResult.status}`);
    }
    if (expectApply && !completedRun.githubPullRequestUrl) {
      throw new Error('expected an engineering draft PR URL, but none was recorded');
    }

    console.log(JSON.stringify({
      ok: true,
      projectId,
      runId,
      status: completedRun.status,
      editorRecommendation: completedRun.editorFinalReport.recommendation,
      editorScore: completedRun.editorFinalReport.overallScore,
      engineeringStatus: completedRun.engineeringApplyResult.status,
      githubBranchName: completedRun.githubBranchName,
      githubPullRequestUrl: completedRun.githubPullRequestUrl,
      artifactTypes: artifacts.map((artifact) => artifact.artifactType),
    }));
  } finally {
    if (projectId) {
      try {
        await fetchWithAuth(
          `/api/v1/projects/${projectId}`,
          { method: 'DELETE' },
          `cleanup temp improvement-loop project ${projectId}`,
          true,
          true,
        );
      } catch (error) {
        console.error(
          `[smoke-cloudrun-improvement-loop] cleanup error for project ${projectId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

main().catch((error) => {
  console.error('[smoke-cloudrun-improvement-loop]', error instanceof Error ? error.message : error);
  process.exit(1);
});
