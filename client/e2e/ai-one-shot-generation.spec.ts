import { resolve } from 'node:path';
import { test } from '@playwright/test';
import {
  configureAiSettings,
  login,
  openProjectByTitleOrCreate,
  startAutonomousGeneration,
  startExportAndWaitForCompletion,
  waitForGenerationCompletion,
} from './helpers';

const REVIEW_PROJECT_TITLE = 'AI One-Shot Quick Review Workspace';
const EXPORT_PDF_PATH = resolve(process.cwd(), '..', 'test-results', 'one-shot-export.pdf');

const ONE_SHOT_PROMPT = [
  'Create a polished D&D 5e one-shot adventure for four level 4 characters.',
  'Title: The Blackglass Mine.',
  'Tone: eerie frontier mystery, haunted mine, pulpy fantasy action.',
  'Central villain/finale: the Gravel Guardian, a cursed stone construct awakened beneath the mine.',
  'Include a strong hook, a short town intro, 3 memorable keyed locations in and around the mine, 3 combat encounters, 1 social encounter, 1 exploration hazard, treasure, and clear DM-running guidance.',
  'Make it publication-ready and concise. Use real section structure, not notes or placeholder scaffolding.',
  'Do not include image-generation instructions.',
].join(' ');

test.describe('AI One-Shot Generation', () => {
  test('should generate and export a complete one-shot adventure', async ({ page }) => {
    test.setTimeout(60 * 60 * 1000);

    await login(page);
    await configureAiSettings(page, {
      provider: 'openai',
      model: 'gpt-4o',
    });

    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE, 'blank', {
      resetIfExists: true,
    });

    await startAutonomousGeneration(page, ONE_SHOT_PROMPT, {
      mode: 'one shot',
      quality: 'Quick Draft',
      pageTarget: 8,
    });

    await waitForGenerationCompletion(page, 20 * 60 * 1000);

    await startExportAndWaitForCompletion(page, 'pdf', 10 * 60 * 1000, EXPORT_PDF_PATH);
  });
});
