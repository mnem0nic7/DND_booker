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

async function getPersistedTitlePageImageUrl(page: Page, projectTitle: string) {
  return page.evaluate(async ({ title }) => {
    const refreshResponse = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include',
    });
    if (!refreshResponse.ok) return null;
    const refreshData = await refreshResponse.json() as { accessToken?: string };
    if (!refreshData.accessToken) return null;

    const projectResponse = await fetch('/api/projects', {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${refreshData.accessToken}`,
      },
    });
    if (!projectResponse.ok) return null;

    const projects = await projectResponse.json() as Array<{ id: string; title: string }>;
    const project = projects.find((entry) => entry.title === title);
    if (!project) return null;

    const documentsResponse = await fetch(`/api/projects/${project.id}/documents`, {
      credentials: 'include',
      headers: {
        Authorization: `Bearer ${refreshData.accessToken}`,
      },
    });
    if (!documentsResponse.ok) return null;

    const documents = await documentsResponse.json() as Array<{ content?: { content?: Array<{ type?: string; attrs?: { coverImageUrl?: string } }> } }>;
    for (const document of documents) {
      const titlePage = document.content?.content?.find((node) => node?.type === 'titlePage');
      const url = titlePage?.attrs?.coverImageUrl?.trim();
      if (url) {
        return url;
      }
    }

    return null;
  }, { title: projectTitle });
}

async function selectBlock(block: Locator) {
  await block.scrollIntoViewIfNeeded();
  await block.click({ force: true });
  await expect(
    block.page().locator('button').filter({ hasText: /Add Image|Edit Image/ }).first(),
  ).toBeVisible({ timeout: 10_000 });
}

async function generateImageForBlock(
  page: Page,
  block: Locator,
  projectTitle: string,
  prompt: string,
  imageLocator: Locator,
  timeoutMs = 4 * 60 * 1000,
) {
  await selectBlock(block);

  const imageChooserButton = page.locator('button').filter({ hasText: /Add Image|Edit Image/ }).first();
  await expect(imageChooserButton).toBeVisible({ timeout: 10_000 });
  await imageChooserButton.evaluate((element: HTMLElement) => element.click());

  const generateButton = page.locator('button').filter({ hasText: 'Generate Image with AI' }).first();
  await expect(generateButton).toBeVisible({ timeout: 10_000 });
  await generateButton.click();

  const promptField = page.locator('.ai-generate-panel textarea').first();
  await expect(promptField).toBeVisible({ timeout: 10_000 });
  await promptField.fill(prompt);
  await page.getByRole('button', { name: 'Generate Image' }).first().click();

  await expect
    .poll(async () => {
      const visibleSrc = await imageLocator.getAttribute('src').catch(() => null);
      if (visibleSrc && visibleSrc.includes('/uploads/')) {
        return visibleSrc;
      }

      const persistedSrc = await getPersistedTitlePageImageUrl(page, projectTitle);
      return persistedSrc && persistedSrc.includes('/uploads/') ? persistedSrc : null;
    }, { timeout: timeoutMs })
    .not.toBeNull();

  const doneButton = page.getByRole('button', { name: 'Done' }).first();
  if (await doneButton.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await doneButton.evaluate((element: HTMLElement) => element.click());
  }
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

    const titlePage = page.locator('.title-page').filter({ hasText: 'Generate with AI' }).first();

    await generateImageForBlock(
      page,
      titlePage,
      REVIEW_PROJECT_TITLE,
      'Painterly fantasy cover art for a D&D one-shot called The Blackglass Mine: a haunted mine entrance of glossy black stone under a blood-red moon, lantern light, drifting fog, frontier village in the distance, dramatic tabletop RPG cover composition, no text.',
      page.locator('.title-page__cover-image img').first(),
    );

    await page.screenshot({ path: EDITOR_SCREENSHOT_PATH, fullPage: true });
    await startExportAndWaitForCompletion(page, 'pdf', 15 * 60 * 1000, EXPORT_PDF_PATH);
  });
});
