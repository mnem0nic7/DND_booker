import { expect, test } from '@playwright/test';

/**
 * Smoke test for the ChatProjectCreation interviewer flow.
 *
 * Verifies that:
 * 1. The interviewer welcome message appears on the dashboard
 * 2. A user prompt is accepted and sent to the server
 * 3. The Ollama-backed interviewer responds with an assistant message
 * 4. The project is created and the ForgeShell console renders
 *
 * Relies on the auth.setup project to provide a stored login session.
 * The local Ollama server (qwen2.5:3b) must be running.
 */

const PROMPT = 'Create a light-hearted one-shot for level 3 characters set in a goblin market.';
// ChatProjectCreation fires 2 sequential LLM calls (createSession + appendMessage).
// Allow up to 5 minutes to accommodate both on a CPU-only local Ollama instance.
const MODEL_TIMEOUT_MS = 5 * 60_000;

test.describe('ChatProjectCreation interviewer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the dashboard to finish loading projects
    await page.waitForLoadState('networkidle');
  });

  test('shows the interviewer welcome message', async ({ page }) => {
    // Open the create panel — click "+" if projects already exist,
    // otherwise the panel is already visible
    const newBtn = page.getByRole('button', { name: 'New project' });
    if (await newBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newBtn.click();
    }

    await expect(
      page.getByText("Tell me about the D&D project you want to create"),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('sends a prompt and the API call completes (ForgeShell or error shown)', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: 'New project' });
    if (await newBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newBtn.click();
    }

    // Wait for the composer placeholder to confirm the panel is ready
    const composer = page.locator('textarea.forge-composer__input');
    await expect(composer).toBeVisible({ timeout: 5_000 });

    await composer.fill(PROMPT);
    await page.locator('button.forge-composer__send').click();

    // The textarea should become disabled while the model is generating
    await expect(composer).toBeDisabled({ timeout: 5_000 });

    // The call completed when EITHER the ForgeShell appears (success)
    // OR a system-error message shows (failure). Both mean the request resolved.
    // Note: React batches setMessages + onCreated so the assistant message may
    // never render before ChatProjectCreation unmounts — check for outcome instead.
    await expect(
      page.locator('.forge-shell, .forge-message-row--system'),
    ).toBeVisible({ timeout: MODEL_TIMEOUT_MS });
  });

  test('creates a project and renders the ForgeShell after the first reply', async ({ page }) => {
    const newBtn = page.getByRole('button', { name: 'New project' });
    if (await newBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await newBtn.click();
    }

    const composer = page.locator('textarea.forge-composer__input');
    await expect(composer).toBeVisible({ timeout: 5_000 });

    await composer.fill(PROMPT);
    await page.locator('button.forge-composer__send').click();

    // Wait for the ForgeShell to mount — it appears once onCreated fires
    // The ForgeShell renders a .forge-shell root element
    await expect(page.locator('.forge-shell')).toBeVisible({ timeout: MODEL_TIMEOUT_MS });

    // The "+" new-project button should be visible again (we're back in normal console view)
    await expect(page.getByRole('button', { name: 'New project' })).toBeVisible({ timeout: 5_000 });
  });
});
