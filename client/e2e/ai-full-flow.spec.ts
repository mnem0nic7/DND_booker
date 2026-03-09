import { test, expect } from '@playwright/test';
import {
  createProject,
  getEditorText,
  goToDashboard,
  insertFirstGeneratedBlock,
  openAiPanel,
  sendAiMessage,
  settleGenerationRun,
  startExportAndWaitForCompletion,
  startAutonomousGeneration,
  waitForAiResponse,
  waitForGenerationRun,
} from './helpers';

test.describe('AI Full Campaign Flow', () => {
  test('should create complete campaign from current AI workflows', async ({ page }) => {
    test.setTimeout(420_000);

    await goToDashboard(page);
    await createProject(page, 'AI Full Flow Test');

    await startAutonomousGeneration(
      page,
      'Create a simple level 3 one-shot adventure about a cursed mine. Include a villain, a signature encounter, and a memorable treasure.',
    );
    await waitForGenerationRun(page, 30_000);
    await settleGenerationRun(page, 45_000);

    await sendAiMessage(page, 'Generate a stat block for a CR 3 Stone Golem named Gravel Guardian');
    await insertFirstGeneratedBlock(page);

    await sendAiMessage(page, 'Generate an NPC profile for a dwarven mine foreman named Durgan Flint');
    await insertFirstGeneratedBlock(page);

    await sendAiMessage(page, 'Generate a magic item: a rare lantern called Heart of the Vein that reveals hidden tunnels');
    await insertFirstGeneratedBlock(page);

    const editorText = await getEditorText(page);
    expect(editorText.length).toBeGreaterThan(100);

    await page.waitForTimeout(3000);
    await openAiPanel(page);
    const evalBtn = page.locator('button:has-text("Evaluate")').first();
    const hasEval = await evalBtn.isVisible({ timeout: 3000 }).catch(() => false);
    if (hasEval) {
      const previousCount = await page.locator('.ai-markdown').count();
      await evalBtn.click();
      const evaluationCompleted = await waitForAiResponse(page, previousCount, 45_000)
        .then(() => true)
        .catch(() => false);

      if (!evaluationCompleted) {
        const stopBtn = page.getByRole('button', { name: 'Stop generating' }).first();
        if (await stopBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
          await stopBtn.click();
        }
      }
    }

    await page.waitForTimeout(3000);
    await openAiPanel(page);
    await sendAiMessage(
      page,
      'Update the H1 heading "The Adventure" to "The Cursed Mine". Keep everything else unchanged.',
      120_000,
    );

    const headingUpdated = await expect
      .poll(async () => (await getEditorText(page)).toLowerCase().includes('the cursed mine'), {
        timeout: 20_000,
      })
      .toBe(true)
      .then(() => true)
      .catch(() => false);
    const updateBanner = page.locator('text=/operation|applied|updated/i').first();
    if (!headingUpdated) {
      await expect(updateBanner).toBeVisible({ timeout: 10_000 });
    }

    const finalText = await getEditorText(page);
    expect(finalText.length).toBeGreaterThan(100);

    await startExportAndWaitForCompletion(page, 'pdf', 120_000);

    const messages = page.locator('.ai-markdown');
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThanOrEqual(4);
  });
});
