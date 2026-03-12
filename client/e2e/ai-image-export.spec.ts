import { resolve } from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  configureAiSettings,
  login,
  openProjectByTitleOrCreate,
  startExportAndWaitForCompletion,
} from './helpers';

const REVIEW_PROJECT_TITLE = 'AI Image Review Workspace';
const EDITOR_SCREENSHOT_PATH = resolve(process.cwd(), '..', 'test-results', 'image-gen-editor.png');
const EXPORT_PDF_PATH = resolve(process.cwd(), '..', 'test-results', 'image-gen-export.pdf');

async function openComponentCreator(page: Page) {
  await page.getByRole('button', { name: 'Create component' }).click();
  await expect(page.getByText('Build D&D content blocks')).toBeVisible({ timeout: 10_000 });
}

async function primeAiSettingsStore(page: Page) {
  await page.getByRole('button', { name: 'AI Settings' }).click();
  await expect(page.getByRole('heading', { name: 'AI Assistant Settings' })).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Close settings' }).click();
  await expect(page.getByRole('heading', { name: 'AI Assistant Settings' })).not.toBeVisible({ timeout: 10_000 });
}

async function createTitlePage(page: Page) {
  await openComponentCreator(page);

  const search = page.getByPlaceholder('Search creatures, spells, NPCs, handouts...');
  await search.fill('title page');
  await expect(page.getByRole('heading', { name: 'Title Page', level: 3 })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('The Blackglass Mine');
  await page.getByRole('textbox', { name: 'Subtitle', exact: true }).fill('An Illustrated D&D 5e One-Shot');
  await page.getByRole('textbox', { name: 'Author', exact: true }).fill('DND Booker');
  await page.getByRole('button', { name: 'Create Title Page' }).click();
}

async function openBlockProperties(block: Locator) {
  await block.click();
  const editButton = block.getByRole('button', { name: 'Edit Properties' });
  await expect(editButton).toBeVisible({ timeout: 10_000 });
  await editButton.click();
}

async function generateImageForBlock(
  page: Page,
  block: Locator,
  prompt: string,
  imageLocator: Locator,
  timeoutMs = 4 * 60 * 1000,
) {
  await openBlockProperties(block);

  const generateButton = block.getByRole('button', { name: 'Generate Image with AI' });
  await expect(generateButton).toBeVisible({ timeout: 10_000 });
  await generateButton.click();

  const promptField = block.locator('.ai-generate-panel textarea').first();
  await expect(promptField).toBeVisible({ timeout: 10_000 });
  await promptField.fill(prompt);
  await block.getByRole('button', { name: 'Generate Image' }).click();

  await expect(imageLocator).toBeVisible({ timeout: timeoutMs });
  await expect
    .poll(async () => {
      const src = await imageLocator.getAttribute('src');
      return Boolean(src && src.includes('/uploads/'));
    }, { timeout: timeoutMs })
    .toBe(true);
}

test.describe('AI Image Export Flow', () => {
  test('should generate cover art and export a review PDF', async ({ page }) => {
    test.setTimeout(90 * 60 * 1000);

    await login(page);
    await configureAiSettings(page, {
      provider: 'openai',
      model: 'gpt-4o',
    });

    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE, 'blank', {
      resetIfExists: true,
    });

    await primeAiSettingsStore(page);
    await createTitlePage(page);

    const titlePage = page.locator('.title-page').first();

    await generateImageForBlock(
      page,
      titlePage,
      'Painterly fantasy cover art for a D&D one-shot called The Blackglass Mine: a haunted mine entrance of glossy black stone under a blood-red moon, lantern light, drifting fog, frontier village in the distance, dramatic tabletop RPG cover composition, no text.',
      titlePage.locator('.title-page__cover-image img'),
    );

    await page.screenshot({ path: EDITOR_SCREENSHOT_PATH, fullPage: true });
    await startExportAndWaitForCompletion(page, 'pdf', 15 * 60 * 1000, EXPORT_PDF_PATH);
  });
});
