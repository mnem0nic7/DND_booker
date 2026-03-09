import { test, expect } from '@playwright/test';
import {
  getEditorText,
  openAiPanel,
  openProjectByTitleOrCreate,
} from './helpers';

const REVIEW_PROJECT_TITLE = 'AI Generation Review Output';

test.describe('AI Campaign Creation Flow', () => {
  test('should create or reopen the shared review project from template', async ({ page }) => {
    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE);
    const editorText = await getEditorText(page);
    expect(editorText.length).toBeGreaterThan(50);
  });

  test('should open the AI panel on the shared review project', async ({ page }) => {
    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE);
    await openAiPanel(page);
    await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });
  });

  test('should expose the autonomous generation entry point', async ({ page }) => {
    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE);
    await openAiPanel(page);

    const generateButton = page.getByRole('button', { name: 'Generate Content' });
    await expect(generateButton).toBeVisible({ timeout: 5000 });
  });

  test('should expose export controls on the shared review project', async ({ page }) => {
    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE);
    await openAiPanel(page);

    await expect(page.getByRole('button', { name: 'Export project' })).toBeVisible({ timeout: 5000 });
  });
});
