import { test as setup, expect, type Page } from '@playwright/test';
import {
  AUTH_FILE,
  TEST_EMAIL,
  TEST_OLLAMA_BASE_URL,
  TEST_OLLAMA_MODEL,
  TEST_PASSWORD,
} from './test-account';

async function configureOllamaForTests(page: Page) {
  const result = await page.evaluate(async ({ model, baseUrl }) => {
    const refreshResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });

    if (!refreshResponse.ok) {
      return {
        ok: false,
        step: 'refresh',
        status: refreshResponse.status,
        body: await refreshResponse.text(),
      };
    }

    const refreshData = await refreshResponse.json() as { accessToken?: string };
    if (!refreshData.accessToken) {
      return {
        ok: false,
        step: 'refresh',
        status: refreshResponse.status,
        body: 'Missing access token in refresh response',
      };
    }

    const settingsResponse = await fetch('/api/ai/settings', {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshData.accessToken}`,
      },
      body: JSON.stringify({
        provider: 'ollama',
        model,
        baseUrl,
      }),
    });

    return {
      ok: settingsResponse.ok,
      step: 'settings',
      status: settingsResponse.status,
      body: await settingsResponse.text(),
    };
  }, { model: TEST_OLLAMA_MODEL, baseUrl: TEST_OLLAMA_BASE_URL });

  expect(result.ok, `Failed to configure Ollama test settings during ${result.step}: ${result.status} ${result.body}`).toBe(true);
}

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);

  // If already authenticated (e.g. from a previous run), save state and return
  const loginField = page.locator('input[type="email"]');
  if (!(await loginField.isVisible({ timeout: 3000 }).catch(() => false))) {
    await configureOllamaForTests(page);
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  await loginField.fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Wait for dashboard
  await expect(page.locator('text=New Project').first()).toBeVisible({ timeout: 10_000 });

  await configureOllamaForTests(page);

  // Save auth state (localStorage with JWT token)
  await page.context().storageState({ path: AUTH_FILE });
});
