import { test as setup, expect } from '@playwright/test';
import { AUTH_FILE, TEST_EMAIL, TEST_PASSWORD } from './test-account';

setup('authenticate', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(1500);

  // If already authenticated (e.g. from a previous run), save state and return
  const loginField = page.locator('input[type="email"]');
  if (!(await loginField.isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.context().storageState({ path: AUTH_FILE });
    return;
  }

  await loginField.fill(TEST_EMAIL);
  await page.locator('input[type="password"]').fill(TEST_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Wait for dashboard
  await expect(page.locator('text=New Project').first()).toBeVisible({ timeout: 10_000 });

  // Save auth state (localStorage with JWT token)
  await page.context().storageState({ path: AUTH_FILE });
});
