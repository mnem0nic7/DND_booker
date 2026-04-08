#!/usr/bin/env node

const baseUrl = (process.env.BASE_URL ?? process.env.SERVICE_URL ?? '').trim().replace(/\/$/, '');
const email = process.env.SMOKE_TEST_EMAIL?.trim();
const password = process.env.SMOKE_TEST_PASSWORD;
const preferredProjectId = process.env.SMOKE_TEST_PROJECT_ID?.trim() || null;
const generationPrompt = process.env.SMOKE_TEST_GENERATION_PROMPT?.trim()
  || '[smoke] Verify api/v1 generation run creation and cancellation';

if (!baseUrl) {
  console.error('BASE_URL or SERVICE_URL is required for the Cloud Run smoke test.');
  process.exit(1);
}

if (!email || !password) {
  console.error('SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD are required for the Cloud Run smoke test.');
  process.exit(1);
}

function assertOk(response, detail) {
  if (response.ok) {
    return;
  }

  throw new Error(`${detail} failed with ${response.status} ${response.statusText}`);
}

async function getJson(response, detail) {
  assertOk(response, detail);
  return response.json();
}

async function main() {
  const loginResponse = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const loginData = await getJson(loginResponse, 'login');
  if (!loginData.accessToken) {
    throw new Error('login succeeded but no access token was returned');
  }

  const authHeaders = {
    Authorization: `Bearer ${loginData.accessToken}`,
  };

  let projectId = preferredProjectId;
  if (!projectId) {
    const projectResponse = await fetch(`${baseUrl}/api/projects`, { headers: authHeaders });
    const projects = await getJson(projectResponse, 'list projects');
    if (!Array.isArray(projects) || projects.length === 0) {
      throw new Error('no projects were available for the smoke test user');
    }

    projectId = projects[0]?.id ?? null;
  }

  if (!projectId) {
    throw new Error('unable to resolve a project id for the smoke test');
  }

  const documentsResponse = await fetch(`${baseUrl}/api/v1/projects/${projectId}/documents`, {
    headers: authHeaders,
  });
  const documents = await getJson(documentsResponse, 'list documents');
  if (!Array.isArray(documents)) {
    throw new Error('document list response was not an array');
  }

  const generationRunsResponse = await fetch(`${baseUrl}/api/v1/projects/${projectId}/generation-runs`, {
    headers: authHeaders,
  });
  const generationRuns = await getJson(generationRunsResponse, 'list generation runs');
  if (!Array.isArray(generationRuns)) {
    throw new Error('generation run list response was not an array');
  }

  const createGenerationRunResponse = await fetch(`${baseUrl}/api/v1/projects/${projectId}/generation-runs`, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: generationPrompt,
      mode: 'one_shot',
      quality: 'quick',
      pageTarget: 5,
    }),
  });
  const createdRun = await getJson(createGenerationRunResponse, 'create generation run');
  if (typeof createdRun.id !== 'string' || typeof createdRun.createdAt !== 'string' || typeof createdRun.updatedAt !== 'string') {
    throw new Error('generation run create response did not return transport-safe timestamps');
  }

  const cancelGenerationRunResponse = await fetch(`${baseUrl}/api/v1/projects/${projectId}/generation-runs/${createdRun.id}/cancel`, {
    method: 'POST',
    headers: authHeaders,
  });
  const cancelledRun = await getJson(cancelGenerationRunResponse, 'cancel generation run');
  if (cancelledRun.status !== 'cancelled') {
    throw new Error(`generation run cancel returned unexpected status ${cancelledRun.status}`);
  }

  console.log(JSON.stringify({
    ok: true,
    projectId,
    documentCount: documents.length,
    generationRunCount: generationRuns.length,
    smokeGenerationRunId: createdRun.id,
  }));
}

main().catch((error) => {
  console.error('[smoke-cloudrun-v1]', error instanceof Error ? error.message : error);
  process.exit(1);
});
