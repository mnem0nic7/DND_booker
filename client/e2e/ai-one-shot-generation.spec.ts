import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  configureAiSettings,
  getLatestExportJobForProject,
  login,
  openProjectByTitleOrCreate,
  startAutonomousGeneration,
  startExportAndWaitForCompletion,
  waitForGenerationCompletion,
} from './helpers';
import { TEST_OPENAI_QUALITY_MODEL } from './test-account';

const REVIEW_PROJECT_TITLE = 'AI One-Shot Quality Review Workspace';
const EXPORT_PDF_PATH = resolve(process.cwd(), '..', 'test-results', 'one-shot-export.pdf');

const ONE_SHOT_PROMPT = [
  'Create a polished D&D 5e one-shot adventure for four level 4 characters.',
  'Title: The Sunken Bell of Alderwatch.',
  'Tone: adventurous fantasy mystery on a storm-lashed marsh frontier, mixing eerie folklore, exploration pressure, local politics, and a heroic finale.',
  'Core premise: a drowned watchtower bell has begun tolling again, stirring marsh spirits, smugglers, and a buried relic beneath Alderwatch.',
  'Keep the table of contents.',
  'Do not optimize for a short page cap; optimize for DM usefulness, rich scene detail, and publication-ready structure.',
  'Include a strong hook, DM brief, clear chapter flow, at least 2 social scenes, 2 exploration scenes, 3 combat encounters, 1 travel hazard, meaningful treasure, and a strong climax.',
  'Every major scene must be dense and runnable with setup, goals, clues, obstacles or checks, escalation, fail-forward outcomes, rewards, and aftermath.',
  'All major encounters must be packaged as full encounter packets, and every creature that needs a stat block must have a complete stat block.',
  'Prefer scene packets, reference boxes, and concrete DM guidance over summary prose.',
  'Make it publication-ready. Use real section structure, not notes or placeholder scaffolding.',
  'Do not include image-generation instructions.',
].join(' ');

const DISALLOWED_REVIEW_CODES = [
  'EXPORT_UNUSED_PAGE_REGION',
  'EXPORT_LAST_PAGE_UNDERFILLED',
  'EXPORT_SPLIT_SCENE_PACKET',
  'EXPORT_UNBALANCED_COLUMNS',
  'EXPORT_MARGIN_COLLISION',
  'EXPORT_FOOTER_COLLISION',
  'EXPORT_ORPHAN_TAIL_PARAGRAPH',
  'EXPORT_EMPTY_ENCOUNTER_TABLE',
  'EXPORT_INCOMPLETE_ENCOUNTER_PACKET',
  'EXPORT_EMPTY_RANDOM_TABLE',
  'EXPORT_THIN_RANDOM_TABLE',
  'EXPORT_PLACEHOLDER_STAT_BLOCK',
  'EXPORT_INCOMPLETE_STAT_BLOCK',
  'EXPORT_SUSPICIOUS_STAT_BLOCK',
  'EXPORT_LOW_UTILITY_DENSITY',
] as const;

test.describe('AI One-Shot Generation', () => {
  test('should generate and export a complete one-shot adventure', async ({ page }) => {
    test.setTimeout(2 * 60 * 60 * 1000);

    await login(page);
    await configureAiSettings(page, {
      provider: 'openai',
      model: TEST_OPENAI_QUALITY_MODEL,
    });

    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE, 'blank', {
      resetIfExists: true,
    });

    await startAutonomousGeneration(page, ONE_SHOT_PROMPT, {
      mode: 'one shot',
      quality: 'Polished',
    });

    await waitForGenerationCompletion(page, 60 * 60 * 1000);

    await startExportAndWaitForCompletion(page, 'pdf', 30 * 60 * 1000, EXPORT_PDF_PATH);

    const exportJob = await getLatestExportJobForProject(page, REVIEW_PROJECT_TITLE);
    expect(exportJob.status).toBe('completed');
    expect(exportJob.review).not.toBeNull();
    expect(exportJob.review?.status).toBe('passed');
    expect(exportJob.review?.score ?? 0).toBeGreaterThanOrEqual(90);

    const findingCodes = new Set(exportJob.review?.findings.map((finding) => finding.code) ?? []);
    for (const code of DISALLOWED_REVIEW_CODES) {
      expect(findingCodes.has(code), `unexpected export review finding: ${code}`).toBe(false);
    }
  });
});
