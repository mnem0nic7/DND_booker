import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertOllamaReady,
  configureAiSettings,
  getLatestExportJobForProject,
  login,
  openProjectByTitleOrCreate,
  startAutonomousGeneration,
  startExportAndWaitForCompletion,
  waitForLatestGenerationRunForProject,
} from './helpers';
import { TEST_OLLAMA_BASE_URL, TEST_OLLAMA_ONE_SHOT_MODEL } from './test-account';

const REVIEW_PROJECT_TITLE = 'AI One-Shot Local Smoke Workspace';
const EXPORT_PDF_PATH = resolve(process.cwd(), '..', 'test-results', 'one-shot-local-export.pdf');

const ONE_SHOT_PROMPT = [
  'D&D 5e one-shot.',
  'Title: Ashes Under Briarford.',
  'Party size: 4 adventurers.',
  'Level range: 4 to 4.',
  'Need a hook, short DM brief, 3 scenes, 2 combats, 1 exploration obstacle, treasure, and conclusion.',
  'Keep it compact, runnable, and text-only.',
].join(' ');

test.describe('AI One-Shot Local Smoke', () => {
  test('should generate and export a local Ollama-backed one-shot adventure', async ({ page }) => {
    test.setTimeout(2 * 60 * 60 * 1000);

    await login(page);
    await assertOllamaReady(page, {
      baseUrl: TEST_OLLAMA_BASE_URL,
      model: TEST_OLLAMA_ONE_SHOT_MODEL,
    });

    await configureAiSettings(page, {
      provider: 'ollama',
      model: TEST_OLLAMA_ONE_SHOT_MODEL,
      baseUrl: TEST_OLLAMA_BASE_URL,
    });

    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE, 'blank', {
      resetIfExists: true,
    });

    await startAutonomousGeneration(page, ONE_SHOT_PROMPT, {
      mode: 'one shot',
      quality: 'Quick Draft',
      pageTarget: 10,
    });

    const generationRun = await waitForLatestGenerationRunForProject(page, REVIEW_PROJECT_TITLE, 60 * 60 * 1000);
    expect(generationRun.status).toBe('completed');
    expect(generationRun.artifactCount).toBeGreaterThanOrEqual(1);

    await startExportAndWaitForCompletion(page, 'pdf', 30 * 60 * 1000, EXPORT_PDF_PATH);

    const exportJob = await getLatestExportJobForProject(page, REVIEW_PROJECT_TITLE);
    expect(exportJob.status).toBe('completed');
    expect(exportJob.review).not.toBeNull();
    expect(exportJob.review?.status === 'passed' || exportJob.review?.status === 'needs_attention').toBe(true);
    expect(exportJob.review?.metrics.pageCount ?? 0).toBeGreaterThanOrEqual(1);

    const pdfStats = await stat(EXPORT_PDF_PATH);
    expect(pdfStats.size).toBeGreaterThan(0);
  });
});
