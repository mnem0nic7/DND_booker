import { Page, expect } from '@playwright/test';

// Test credentials (Docker DB test account)
export const TEST_EMAIL = 'm7.ga.77@gmail.com';
export const TEST_PASSWORD = '2Rickie2!';

/**
 * Login via the UI and wait for dashboard to load.
 */
export async function login(page: Page) {
  await page.goto('/');

  // If already logged in (has token), may redirect to dashboard
  const url = page.url();
  if (!url.includes('login') && !url.includes('register')) {
    // Check if we're on the dashboard
    const dashboard = page.locator('text=New Project, text=My Projects').first();
    if (await dashboard.isVisible({ timeout: 2000 }).catch(() => false)) return;
  }

  // Fill login form
  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for dashboard or project list to appear
  await expect(page.locator('text=New Project').first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Create a new project from the dashboard with the given template.
 */
export async function createProject(
  page: Page,
  name: string,
  template: 'one-shot' | 'campaign' | 'supplement' | 'sourcebook' | 'blank' = 'one-shot',
) {
  // Click New Project button
  await page.click('text=New Project');

  // Wait for template selection modal
  await expect(page.locator('text=Choose a Template').first()).toBeVisible({ timeout: 5000 });

  // Select template - click the card that matches
  const templateMap: Record<string, string> = {
    'one-shot': 'One-Shot',
    campaign: 'Campaign',
    supplement: 'Supplement',
    sourcebook: 'Sourcebook',
    blank: 'Blank',
  };
  await page.click(`text=${templateMap[template]}`);

  // Wait for editor to load
  await expect(page.locator('.ProseMirror').first()).toBeVisible({ timeout: 10_000 });

  // Rename the project - double-click the project name in sidebar
  const projectNameEl = page.locator('[data-testid="project-name"], .document-title').first();
  if (await projectNameEl.isVisible({ timeout: 2000 }).catch(() => false)) {
    await projectNameEl.dblclick();
    await page.keyboard.press('Control+a');
    await page.keyboard.type(name);
    await page.keyboard.press('Enter');
  }
}

/**
 * Open the AI chat panel.
 */
export async function openAiPanel(page: Page) {
  // Look for the AI button in the toolbar/sidebar
  const aiButton = page.locator('button:has-text("AI"), [aria-label*="AI"]').first();
  if (await aiButton.isVisible({ timeout: 2000 }).catch(() => false)) {
    await aiButton.click();
  }
  // Wait for chat panel to appear
  await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });
}

/**
 * Send a message in the AI chat and wait for the response to complete streaming.
 */
export async function sendAiMessage(page: Page, message: string, timeoutMs = 90_000) {
  // Find the chat input
  const input = page.locator('textarea[placeholder*="Ask"], textarea[placeholder*="message"], input[placeholder*="Ask"]').first();
  await input.fill(message);
  await input.press('Enter');

  // Wait for streaming to complete by watching for the bouncing dots to disappear
  // The streaming indicator has animate-bounce class
  await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.animate-bounce').first()).not.toBeVisible({ timeout: timeoutMs });
}

/**
 * Wait for wizard generation to complete.
 */
export async function waitForWizardComplete(page: Page, timeoutMs = 180_000) {
  // Wait for "Insert All" or completed section indicators
  await expect(
    page.locator('button:has-text("Insert All"), text=Generation complete').first(),
  ).toBeVisible({ timeout: timeoutMs });
}

/**
 * Click "Insert All" to insert all wizard-generated sections.
 */
export async function insertAllSections(page: Page) {
  const insertAllBtn = page.locator('button:has-text("Insert All")').first();
  if (await insertAllBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await insertAllBtn.click();
    // Wait for insertion to complete
    await page.waitForTimeout(2000);
  }
}

/**
 * Count blocks of a specific type in the editor.
 */
export async function countBlocks(page: Page, blockType: string): Promise<number> {
  return page.locator(`[data-type="${blockType}"]`).count();
}

/**
 * Get the editor's text content (visible text).
 */
export async function getEditorText(page: Page): Promise<string> {
  return page.locator('.ProseMirror').first().innerText();
}
