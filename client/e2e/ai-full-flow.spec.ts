import { test, expect } from '@playwright/test';

/** Navigate to the dashboard. */
async function goToDashboard(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('text=New Project').first()).toBeVisible({ timeout: 10_000 });
}

/** Create a new project from template. */
async function createProject(page: import('@playwright/test').Page, title: string) {
  await page.locator('button:has-text("New Project")').click();
  await expect(page.locator('text=Choose a Template').first()).toBeVisible({ timeout: 5000 });
  await page.locator('button:has-text("Use Template")').first().click();
  await expect(page.locator('text=Project Details').first()).toBeVisible({ timeout: 5000 });
  await page.locator('input[placeholder*="title"]').first().fill(title);
  await page.locator('button:has-text("Create Project")').click();
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 15_000 });
}

/** Ensure the AI chat panel is open (open it if closed). */
async function ensureAiPanelOpen(page: import('@playwright/test').Page) {
  const textarea = page.locator('textarea').first();
  const isOpen = await textarea.isVisible({ timeout: 1000 }).catch(() => false);
  if (!isOpen) {
    await page.locator('button:has-text("AI")').first().click();
    await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });
  }
}

/** Send a chat message and wait for streaming to complete. */
async function sendMessage(page: import('@playwright/test').Page, msg: string, timeoutMs = 120_000) {
  await ensureAiPanelOpen(page);
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 5000 });
  await textarea.fill(msg);
  await textarea.press('Enter');
  // Wait for streaming indicator to appear then disappear
  await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: timeoutMs });
}

/** Wait for any wizard generation to finish and insert sections. */
async function waitForWizardDone(page: import('@playwright/test').Page, timeoutMs = 180_000) {
  const insertSectionsBtn = page.locator('button:has-text("Section")').first();
  const stopBtn = page.locator('button:has-text("Stop Generating")').first();

  // If wizard is actively generating, wait for completion
  const wizardActive = await stopBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (wizardActive) {
    await expect(insertSectionsBtn).toBeVisible({ timeout: timeoutMs });
    await insertSectionsBtn.click();
    await page.waitForTimeout(3000);
    return true;
  }

  // Check if Insert Sections button is already visible
  const hasInsert = await insertSectionsBtn.isVisible({ timeout: 5000 }).catch(() => false);
  if (hasInsert) {
    await insertSectionsBtn.click();
    await page.waitForTimeout(3000);
    return true;
  }

  return false;
}

test.describe('AI Full Campaign Flow', () => {
  test('should create complete campaign from AI prompts', async ({ page }) => {
    test.setTimeout(600_000); // 10 minutes for full flow

    // Step 1: Create project
    await goToDashboard(page);
    await createProject(page, 'AI Full Flow Test');

    // Step 2: Open AI and ask it to create adventure content
    await ensureAiPanelOpen(page);
    await sendMessage(page, 'Create a one-shot adventure for level 3 players about a cursed mine.', 120_000);

    // Step 3: Handle wizard if it was triggered
    const wizardHandled = await waitForWizardDone(page);

    if (!wizardHandled) {
      // AI might need explicit instruction to use wizard
      await sendMessage(page, 'Go ahead and generate the full adventure content now', 120_000);
      await waitForWizardDone(page);
    }

    // Step 4: Verify content was generated
    const editorText = await page.locator('.ProseMirror').first().innerText();
    expect(editorText.length).toBeGreaterThan(200);

    // Step 5: Re-open AI panel (may have closed), add a stat block
    await page.waitForTimeout(5000);
    await sendMessage(page, 'Generate a stat block for a CR 3 Stone Golem named Gravel Guardian');
    const insertBtn = page.locator('button:has-text("Insert")').first();
    const hasInsert = await insertBtn.isVisible({ timeout: 10_000 }).catch(() => false);
    if (hasInsert) {
      await insertBtn.click();
      await page.waitForTimeout(2000);
    }

    // Step 6: Ask AI to evaluate the document
    await page.waitForTimeout(3000);
    await ensureAiPanelOpen(page);
    const evalBtn = page.locator('button:has-text("Evaluate")').first();
    const hasEval = await evalBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasEval) {
      await evalBtn.click();
      await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 120_000 });
    }

    // Step 7: Ask AI to make an edit
    await page.waitForTimeout(3000);
    await sendMessage(page, 'Update the title page to set the subtitle to "A Level 3 One-Shot Adventure"');

    // Verify the editor still has substantial content
    const finalText = await page.locator('.ProseMirror').first().innerText();
    expect(finalText.length).toBeGreaterThan(200);

    // Step 8: Verify AI chat history persists
    const messages = page.locator('.ai-markdown');
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThanOrEqual(2);
  });
});
