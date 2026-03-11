import { test, expect } from '@playwright/test';
import {
  clearGenerationRunPanel,
  getEditorText,
  openProjectByTitleOrCreate,
  startExportAndWaitForCompletion,
  startAutonomousGeneration,
  waitForGenerationCompletion,
  waitForGenerationRun,
} from './helpers';

const REVIEW_PROJECT_TITLE = 'AI Generation Review Output';

test.describe('AI Full Campaign Flow', () => {
  test('should create the single shared generation artifact and export it', async ({ page }) => {
    test.setTimeout(600_000);

    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE);
    await clearGenerationRunPanel(page);

    await startAutonomousGeneration(
      page,
      'Create a simple level 3 one-shot adventure about a cursed mine. Include a villain, a signature encounter, and a memorable treasure.',
    );
    await waitForGenerationRun(page, 30_000);
    await waitForGenerationCompletion(page, 480_000);

    const editorText = await getEditorText(page);
    expect(editorText.length).toBeGreaterThan(100);

    await startExportAndWaitForCompletion(page, 'pdf', 120_000);
  });
});
