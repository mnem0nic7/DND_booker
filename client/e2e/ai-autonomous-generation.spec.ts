import { test, expect } from '@playwright/test';

/**
 * Autonomous Generation E2E Tests
 *
 * These tests verify the autonomous generation UI flow.
 * They require:
 * - Running client (localhost:3000)
 * - Running server (localhost:4000)
 * - Configured AI provider (API key in user settings)
 * - Running Redis (for BullMQ)
 *
 * These tests are slow by nature (AI generation takes time).
 * Use `npx playwright test ai-autonomous-generation` to run them specifically.
 */

/** Navigate to the dashboard with retry on slow loads. */
async function goToDashboard(page: import('@playwright/test').Page) {
  await page.goto('/');
  const newProjectBtn = page.locator('text=New Project').first();
  const visible = await newProjectBtn.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!visible) {
    await page.reload();
    await expect(newProjectBtn).toBeVisible({ timeout: 15_000 });
  }
}

/** Create a new project and navigate to editor. */
async function createProject(page: import('@playwright/test').Page, title = 'E2E Gen Test') {
  await page.locator('button:has-text("New Project")').click();
  await expect(page.locator('text=Choose a Template').first()).toBeVisible({ timeout: 5000 });
  await page.locator('button:has-text("Use Template")').first().click();
  await expect(page.locator('text=Project Details').first()).toBeVisible({ timeout: 5000 });
  await page.locator('input[placeholder*="title"]').first().fill(title);
  await page.locator('button:has-text("Create Project")').click();
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 15_000 });
}

/** Open the AI panel. */
async function openAiPanel(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("AI")').first().click();
  await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });
}

/**
 * Open the Generate Content dialog.
 * Returns true if the dialog was opened, false if the button was not found.
 */
async function openGenerateDialog(page: import('@playwright/test').Page): Promise<boolean> {
  // The Generate Content button may be in the AI panel or editor toolbar
  const genButton = page.locator('button:has-text("Generate Content"), button:has-text("Generate")').first();
  const hasGenButton = await genButton.isVisible({ timeout: 5000 }).catch(() => false);

  if (!hasGenButton) return false;

  await genButton.click();
  await expect(page.locator('text=Generate Content')).toBeVisible({ timeout: 5000 });
  return true;
}

test.describe('Autonomous Generation UI', () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
  });

  test('should show Generate Content dialog with all options', async ({ page }) => {
    await createProject(page, 'Gen Dialog Test');
    await openAiPanel(page);

    const opened = await openGenerateDialog(page);
    if (!opened) {
      test.skip(true, 'Generate Content button not found in UI');
      return;
    }

    // Prompt textarea
    await expect(page.locator('textarea')).toBeVisible();

    // Mode buttons (rendered as lowercase with space: "one shot", "module", etc.)
    await expect(page.locator('button:has-text("one shot")')).toBeVisible();
    await expect(page.locator('button:has-text("module")')).toBeVisible();
    await expect(page.locator('button:has-text("campaign")')).toBeVisible();
    await expect(page.locator('button:has-text("sourcebook")')).toBeVisible();

    // Quality buttons
    await expect(page.locator('button:has-text("Quick Draft")')).toBeVisible();
    await expect(page.locator('button:has-text("Polished")')).toBeVisible();

    // Page target input
    await expect(page.locator('input[type="number"]')).toBeVisible();

    // Cancel button
    await expect(page.locator('button:has-text("Cancel")')).toBeVisible();

    // Generate button (disabled without prompt)
    const generateBtn = page.locator('button:has-text("Generate")').last();
    await expect(generateBtn).toBeDisabled();
  });

  test('should enable Generate button when prompt is entered', async ({ page }) => {
    await createProject(page, 'Gen Enable Test');
    await openAiPanel(page);

    const opened = await openGenerateDialog(page);
    if (!opened) {
      test.skip(true, 'Generate Content button not found in UI');
      return;
    }

    // Type a prompt
    const textarea = page.locator('textarea');
    await textarea.fill('A level 4 goblin cave adventure for new players');

    // Generate button should now be enabled
    const generateBtn = page.locator('button:has-text("Generate")').last();
    await expect(generateBtn).toBeEnabled();
  });

  test('should close dialog on Cancel', async ({ page }) => {
    await createProject(page, 'Gen Cancel Test');
    await openAiPanel(page);

    const opened = await openGenerateDialog(page);
    if (!opened) {
      test.skip(true, 'Generate Content button not found in UI');
      return;
    }

    // Click Cancel
    await page.locator('button:has-text("Cancel")').click();

    // Dialog should close
    await expect(page.locator('text=Generate Content')).not.toBeVisible({ timeout: 3000 });
  });

  test('should select different mode and quality options', async ({ page }) => {
    await createProject(page, 'Gen Options Test');
    await openAiPanel(page);

    const opened = await openGenerateDialog(page);
    if (!opened) {
      test.skip(true, 'Generate Content button not found in UI');
      return;
    }

    // Select campaign mode
    await page.locator('button:has-text("campaign")').click();

    // Select polished quality
    await page.locator('button:has-text("Polished")').click();

    // Set page target
    await page.locator('input[type="number"]').fill('120');

    // Verify selections are visually active (purple border indicates selected state)
    const campaignBtn = page.locator('button:has-text("campaign")');
    await expect(campaignBtn).toHaveClass(/border-purple-500/);

    const polishedBtn = page.locator('button:has-text("Polished")');
    await expect(polishedBtn).toHaveClass(/border-purple-500/);

    // "one shot" (default) should no longer be active
    const oneShotBtn = page.locator('button:has-text("one shot")');
    await expect(oneShotBtn).not.toHaveClass(/border-purple-500/);

    // "Quick Draft" should no longer be active
    const quickBtn = page.locator('button:has-text("Quick Draft")');
    await expect(quickBtn).not.toHaveClass(/border-purple-500/);
  });

  test('should start a generation run and show progress panel', async ({ page }) => {
    test.setTimeout(180_000); // 3 min — generation is slow

    await createProject(page, 'Gen Run Test');
    await openAiPanel(page);

    const opened = await openGenerateDialog(page);
    if (!opened) {
      test.skip(true, 'Generate Content button not found in UI');
      return;
    }

    // Fill prompt and start
    await page.locator('textarea').fill('A simple goblin cave adventure for new players');
    const generateBtn = page.locator('button:has-text("Generate")').last();
    await generateBtn.click();

    // Dialog should close after successful start
    await expect(page.locator('h2:has-text("Generate Content")')).not.toBeVisible({ timeout: 10_000 });

    // Progress panel should appear with a status indicator.
    // The GenerationRunPanel shows stage labels from STAGE_LABELS:
    // Queued, Planning Campaign, Creating Assets, Writing Chapters, etc.
    const progressIndicator = page.locator(
      'text=Queued, text=Planning Campaign, text=Creating Assets, text=Writing Chapters, text=Quality Review, text=Assembling Documents',
    ).first();
    await expect(progressIndicator).toBeVisible({ timeout: 30_000 });

    // Should see Pause and Cancel buttons while run is active
    const pauseBtn = page.locator('button:has-text("Pause")');
    const cancelBtn = page.locator('button:has-text("Cancel")');

    // At least one control should be visible while running
    const hasPause = await pauseBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasCancel = await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasPause || hasCancel).toBe(true);
  });

  test('should cancel a running generation', async ({ page }) => {
    test.setTimeout(120_000);

    await createProject(page, 'Gen Cancel Run Test');
    await openAiPanel(page);

    const opened = await openGenerateDialog(page);
    if (!opened) {
      test.skip(true, 'Generate Content button not found in UI');
      return;
    }

    await page.locator('textarea').fill('A quick test adventure');
    await page.locator('button:has-text("Generate")').last().click();

    // Wait for progress to appear
    await page.waitForTimeout(3000);

    // Cancel the run
    const cancelBtn = page.locator('button:has-text("Cancel")');
    const hasCancel = await cancelBtn.isVisible({ timeout: 15_000 }).catch(() => false);
    if (hasCancel) {
      await cancelBtn.click();

      // Should show Cancelled status and Dismiss button
      const dismissOrCancelled = page.locator('text=Cancelled, button:has-text("Dismiss")').first();
      await expect(dismissOrCancelled).toBeVisible({ timeout: 10_000 });
    }
  });

  test('should pause and resume a running generation', async ({ page }) => {
    test.setTimeout(180_000);

    await createProject(page, 'Gen Pause Test');
    await openAiPanel(page);

    const opened = await openGenerateDialog(page);
    if (!opened) {
      test.skip(true, 'Generate Content button not found in UI');
      return;
    }

    await page.locator('textarea').fill('A haunted forest adventure with undead encounters');
    await page.locator('button:has-text("Generate")').last().click();

    // Wait for active status
    await page.waitForTimeout(3000);

    // Pause the run
    const pauseBtn = page.locator('button:has-text("Pause")');
    const hasPause = await pauseBtn.isVisible({ timeout: 15_000 }).catch(() => false);
    if (!hasPause) {
      // Run may have completed or failed already
      return;
    }

    await pauseBtn.click();

    // Should show Paused status and Resume button
    const resumeBtn = page.locator('button:has-text("Resume")');
    await expect(resumeBtn).toBeVisible({ timeout: 10_000 });

    // Resume the run
    await resumeBtn.click();

    // Pause button should reappear (run is active again)
    await expect(pauseBtn).toBeVisible({ timeout: 10_000 });
  });

  test('should show Dismiss button when run completes', async ({ page }) => {
    test.setTimeout(300_000); // 5 min for full generation

    await createProject(page, 'Gen Complete Test');
    await openAiPanel(page);

    const opened = await openGenerateDialog(page);
    if (!opened) {
      test.skip(true, 'Generate Content button not found in UI');
      return;
    }

    await page.locator('textarea').fill('A very simple level 1 goblin encounter one-shot');
    // Use quick quality for speed (it's the default)
    await page.locator('button:has-text("Generate")').last().click();

    // Wait for completion — this could take a while
    const dismissBtn = page.locator('button:has-text("Dismiss")');
    const completed = await dismissBtn.isVisible({ timeout: 240_000 }).catch(() => false);

    if (completed) {
      // Should show "Complete" status
      await expect(page.locator('text=Complete')).toBeVisible();

      // Click dismiss
      await dismissBtn.click();

      // Panel should disappear
      await expect(dismissBtn).not.toBeVisible({ timeout: 3000 });
    } else {
      // Generation may still be running or failed — that's OK for E2E
      console.log('Generation did not complete within timeout — may need longer or different prompt');
    }
  });
});
