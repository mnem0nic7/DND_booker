import { test, expect } from '@playwright/test';
import {
  createProject,
  getEditorText,
  goToDashboard,
  openAiPanel,
  openFirstProject,
  sendAiMessage,
  settleGenerationRun,
  startAutonomousGeneration,
  waitForChatHistory,
  waitForAiResponse,
  waitForGenerationRun,
} from './helpers';

test.describe('AI Campaign Creation Flow', () => {
  test.beforeEach(async ({ page }) => {
    await goToDashboard(page);
  });

  test('should create a new project from template', async ({ page }) => {
    await createProject(page, 'Template Test Project');
    const editorText = await getEditorText(page);
    expect(editorText.length).toBeGreaterThan(50);
  });

  test('should open AI panel and send a message', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);
    await sendAiMessage(page, 'Hello, what can you help me with?');

    const messages = page.locator('.ai-markdown');
    await expect(messages.first()).toBeVisible({ timeout: 5000 });
    const responseText = await messages.first().innerText();
    expect(responseText.length).toBeGreaterThan(20);
  });

  test('should generate a stat block via AI chat', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);
    await sendAiMessage(page, 'Generate a CR 1 goblin warrior stat block');

    const insertBtn = page.locator('button:has-text("Insert")').first();
    const hasInsert = await insertBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasInsert) {
      await insertBtn.click();
      await page.waitForTimeout(2000);

      const statBlocks = page.locator('.node-statBlock');
      const count = await statBlocks.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should start autonomous generation for a full adventure', async ({ page }) => {
    test.setTimeout(180_000);

    await createProject(page, 'Autonomous Adventure Test');
    await startAutonomousGeneration(
      page,
      'Create a one-shot adventure for level 5 players about a haunted lighthouse.',
    );

    await waitForGenerationRun(page, 30_000);
    await settleGenerationRun(page, 45_000);

    await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });
    expect((await getEditorText(page)).length).toBeGreaterThan(50);
  });

  test('should evaluate document', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);

    const evalBtn = page.locator('button:has-text("Evaluate")').first();
    const hasEval = await evalBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasEval) {
      const previousCount = await page.locator('.ai-markdown').count();
      await evalBtn.click();
      await waitForAiResponse(page, previousCount, 120_000);

      const messages = page.locator('.ai-markdown');
      const count = await messages.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('should edit document via AI chat', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);

    await sendAiMessage(
      page,
      'Update the H1 heading "The Adventure" to "The Haunted Lighthouse". Keep everything else unchanged.',
      120_000,
    );

    const statusMsg = page.locator('text=/operation|applied|updated/i').first();
    const headingUpdated = await expect
      .poll(async () => (await getEditorText(page)).toLowerCase().includes('the haunted lighthouse'), {
        timeout: 20_000,
      })
      .toBe(true)
      .then(() => true)
      .catch(() => false);

    if (!headingUpdated) {
      await expect(statusMsg).toBeVisible({ timeout: 10_000 });
    }
  });

  test('should reopen AI panel without losing chat history', async ({ page }) => {
    await openFirstProject(page);
    await openAiPanel(page);
    await sendAiMessage(page, 'Give me a one sentence plot hook.');

    const messages = page.locator('.ai-markdown');
    const messageCountBefore = await messages.count();

    await page.locator('button:has-text("AI")').first().click();
    await page.waitForTimeout(500);
    await page.locator('button:has-text("AI")').first().click();
    await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });

    await waitForChatHistory(page, messageCountBefore);
  });
});
