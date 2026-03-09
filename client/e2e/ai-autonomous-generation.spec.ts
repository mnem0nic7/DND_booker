import { test, expect } from '@playwright/test';
import { openGenerateDialog, openProjectByTitleOrCreate } from './helpers';

const REVIEW_PROJECT_TITLE = 'AI Generation Review Output';

test.describe('Autonomous Generation Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE);
  });

  test('should show Generate Content dialog with all options', async ({ page }) => {
    const dialog = await openGenerateDialog(page);

    await expect(dialog.locator('textarea')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'one shot' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'module' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'campaign' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'sourcebook' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Quick Draft' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Polished' })).toBeVisible();
    await expect(dialog.locator('input[type="number"]')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Generate' })).toBeDisabled();
  });

  test('should enable Generate button when prompt is entered', async ({ page }) => {
    const dialog = await openGenerateDialog(page);

    await dialog.locator('textarea').fill('A level 4 goblin cave adventure for new players');
    await expect(dialog.getByRole('button', { name: 'Generate' })).toBeEnabled();
  });

  test('should close dialog on Cancel', async ({ page }) => {
    const dialog = await openGenerateDialog(page);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test('should select different mode and quality options', async ({ page }) => {
    const dialog = await openGenerateDialog(page);

    await dialog.getByRole('button', { name: 'campaign' }).click();
    await dialog.getByRole('button', { name: 'Polished' }).click();
    await dialog.locator('input[type="number"]').fill('120');

    await expect(dialog.getByRole('button', { name: 'campaign' })).toHaveClass(/border-purple-500/);
    await expect(dialog.getByRole('button', { name: 'Polished' })).toHaveClass(/border-purple-500/);
    await expect(dialog.getByRole('button', { name: 'one shot' })).not.toHaveClass(/border-purple-500/);
    await expect(dialog.getByRole('button', { name: 'Quick Draft' })).not.toHaveClass(/border-purple-500/);
  });
});
