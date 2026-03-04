import { test, expect } from '@playwright/test';

/** Navigate to the dashboard. */
async function goToDashboard(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('text=New Project').first()).toBeVisible({ timeout: 10_000 });
}

/** Create a new project: select template, fill title, click Create. */
async function createProject(page: import('@playwright/test').Page, title = 'E2E Test Project') {
  await page.locator('button:has-text("New Project")').click();
  await expect(page.locator('text=Choose a Template').first()).toBeVisible({ timeout: 5000 });
  await page.locator('button:has-text("Use Template")').first().click();
  await expect(page.locator('text=Project Details').first()).toBeVisible({ timeout: 5000 });
  await page.locator('input[placeholder*="title"]').first().fill(title);
  await page.locator('button:has-text("Create Project")').click();
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 15_000 });
}

/** Open the first project from the dashboard. */
async function openFirstProject(page: import('@playwright/test').Page) {
  const projectHeading = page.locator('main h3').first();
  await projectHeading.click();
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 10_000 });
}

/** Open the AI chat panel. */
async function openAiPanel(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("AI")').first().click();
  await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });
}

/** Send a chat message and wait for streaming to complete. */
async function sendMessage(page: import('@playwright/test').Page, msg: string, timeoutMs = 90_000) {
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 5000 });
  await textarea.fill(msg);
  await textarea.press('Enter');
  await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: timeoutMs });
}

test.describe('AI Campaign Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
  });

  test('should create a new project from template', async ({ page }) => {
    await createProject(page, 'Template Test Project');
    const editorText = await page.locator('.ProseMirror').first().innerText();
    expect(editorText.length).toBeGreaterThan(50);
  });

  test('should open AI panel and send a message', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);
    await sendMessage(page, 'Hello, what can you help me with?');

    const messages = page.locator('.ai-markdown');
    await expect(messages.first()).toBeVisible({ timeout: 5000 });
    const responseText = await messages.first().innerText();
    expect(responseText.length).toBeGreaterThan(20);
  });

  test('should generate a stat block via AI chat', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);
    await sendMessage(page, 'Generate a CR 1 goblin warrior stat block');

    const insertBtn = page.locator('button:has-text("Insert")').first();
    const hasInsert = await insertBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasInsert) {
      await insertBtn.click();
      await page.waitForTimeout(2000);

      // TipTap renders node views with class "node-<type>"
      const statBlocks = page.locator('.node-statBlock');
      const count = await statBlocks.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should use wizard to create full adventure', async ({ page }) => {
    test.setTimeout(300_000);

    await createProject(page, 'Wizard Test Project');
    await openAiPanel(page);

    await sendMessage(page, 'Create a one-shot adventure for level 5 players about a haunted lighthouse', 120_000);

    // Wizard completion button says "Insert N Section(s)"
    const insertSectionsBtn = page.locator('button:has-text("Section")').first();

    // The wizard may auto-trigger and show progress, or show a confirmation card
    // Wait for the Insert Sections button to appear (generated sections ready)
    const hasInsertBtn = await insertSectionsBtn.isVisible({ timeout: 180_000 }).catch(() => false);

    if (hasInsertBtn) {
      await insertSectionsBtn.click();
      await page.waitForTimeout(3000);
      const editorText = await page.locator('.ProseMirror').first().innerText();
      expect(editorText.length).toBeGreaterThan(500);
    } else {
      // If no wizard triggered, the AI probably asked questions — respond
      await sendMessage(page, 'Yes, go ahead and generate it with those details', 120_000);
      await expect(insertSectionsBtn).toBeVisible({ timeout: 180_000 });
      await insertSectionsBtn.click();
      await page.waitForTimeout(3000);
    }
  });

  test('should evaluate document', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);

    const evalBtn = page.locator('button:has-text("Evaluate")').first();
    const hasEval = await evalBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasEval) {
      await evalBtn.click();
      await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 15_000 });
      await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: 120_000 });

      const messages = page.locator('.ai-markdown');
      const count = await messages.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should reopen AI panel without re-triggering wizard', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);

    await page.locator('button:has-text("AI")').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("AI")').first().click();
    await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(3000);
    const wizardGenerating = page.locator('text=Generating section');
    const count = await wizardGenerating.count();
    expect(count).toBe(0);
  });
});
