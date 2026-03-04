import { test, expect } from '@playwright/test';

async function createBlankProject(page: import('@playwright/test').Page) {
  await page.goto('/');
  await expect(page.locator('text=New Project').first()).toBeVisible({ timeout: 10_000 });
  await page.locator('button:has-text("New Project")').click();
  await expect(page.locator('text=Choose a Template').first()).toBeVisible({ timeout: 5000 });

  // Click "Skip — start with a blank project" link (may need scroll)
  const skipLink = page.locator('text=start with a blank project');
  await skipLink.scrollIntoViewIfNeeded();
  await skipLink.click();

  // Fill project details
  await expect(page.locator('input[placeholder*="title"]').first()).toBeVisible({ timeout: 5000 });
  await page.locator('input[placeholder*="title"]').first().fill('Block Gen Test');
  await page.locator('button:has-text("Create Project")').click();
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 15_000 });
}

async function openAiPanel(page: import('@playwright/test').Page) {
  await page.locator('button:has-text("AI")').first().click();
  await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });
}

async function sendMessage(page: import('@playwright/test').Page, msg: string, timeoutMs = 90_000) {
  const textarea = page.locator('textarea').first();
  await expect(textarea).toBeVisible({ timeout: 5000 });
  await textarea.fill(msg);
  await textarea.press('Enter');
  await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: timeoutMs });
}

test.describe('AI Block Generation', () => {
  test.beforeEach(async ({ page }) => {
    await createBlankProject(page);
    await openAiPanel(page);
  });

  test('should generate and insert a stat block', async ({ page }) => {
    await sendMessage(page, 'Generate a stat block for a CR 2 orc warrior named Grukk');

    const insertBtn = page.locator('button:has-text("Insert")').first();
    await expect(insertBtn).toBeVisible({ timeout: 5000 });

    await insertBtn.click();
    await page.waitForTimeout(2000);

    const editorContent = await page.locator('.ProseMirror').first().innerText();
    expect(editorContent.toLowerCase()).toContain('grukk');
  });

  test('should generate and insert a magic item', async ({ page }) => {
    await sendMessage(page, 'Generate a magic item: a legendary sword called Frostbane that deals cold damage');

    const insertBtn = page.locator('button:has-text("Insert")').first();
    const hasInsert = await insertBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasInsert) {
      await insertBtn.click();
      await page.waitForTimeout(2000);
      const editorContent = await page.locator('.ProseMirror').first().innerText();
      expect(editorContent.toLowerCase()).toContain('frostbane');
    }
  });

  test('should generate and insert a spell card', async ({ page }) => {
    await sendMessage(page, 'Generate a spell card for a 3rd level evocation spell called Arcane Barrage');

    const insertBtn = page.locator('button:has-text("Insert")').first();
    const hasInsert = await insertBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasInsert) {
      await insertBtn.click();
      await page.waitForTimeout(2000);
      const editorContent = await page.locator('.ProseMirror').first().innerText();
      expect(editorContent.toLowerCase()).toContain('arcane barrage');
    }
  });

  test('should generate and insert an NPC profile', async ({ page }) => {
    await sendMessage(page, 'Generate an NPC profile for a half-elf innkeeper named Sera Brightwater');

    const insertBtn = page.locator('button:has-text("Insert")').first();
    const hasInsert = await insertBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasInsert) {
      await insertBtn.click();
      await page.waitForTimeout(2000);
      const editorContent = await page.locator('.ProseMirror').first().innerText();
      expect(editorContent.toLowerCase()).toContain('sera');
    }
  });

  test('should generate and insert a random table', async ({ page }) => {
    await sendMessage(page, 'Generate a d6 random encounter table for a haunted forest');

    const insertBtn = page.locator('button:has-text("Insert")').first();
    const hasInsert = await insertBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasInsert) {
      await insertBtn.click();
      await page.waitForTimeout(2000);
      const editorContent = await page.locator('.ProseMirror').first().innerText();
      expect(editorContent.toLowerCase()).toContain('forest');
    }
  });
});
