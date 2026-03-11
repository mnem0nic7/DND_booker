import { test, expect } from '@playwright/test';
import {
  getEditorText,
  insertFirstGeneratedBlock,
  openProjectByTitleOrCreate,
  sendAiMessage,
  startExportAndWaitForCompletion,
} from './helpers';

const REVIEW_PROJECT_TITLE = 'AI Local Model Review Workspace';
const REVIEW_PROJECT_TEMPLATE = 'blank' as const;

test.describe('AI Full Campaign Flow', () => {
  test('should generate a single shared review artifact and export it', async ({ page }) => {
    test.setTimeout(30 * 60 * 1000);

    await openProjectByTitleOrCreate(page, REVIEW_PROJECT_TITLE, REVIEW_PROJECT_TEMPLATE);
    const initialText = await getEditorText(page);
    const initialGuardianMentions = initialText.match(/Gravel Guardian/g)?.length ?? 0;
    const initialTextLength = initialText.length;

    await sendAiMessage(
      page,
      'Generate only a fenced ```json``` code block for an insertable D&D 5e stat block. Do not include any prose before or after it. The creature is a CR 3 Stone Golem named Gravel Guardian for a cursed mine one-shot adventure.',
      10 * 60 * 1000,
    );
    await insertFirstGeneratedBlock(page);

    await expect
      .poll(async () => (await getEditorText(page)).match(/Gravel Guardian/g)?.length ?? 0, { timeout: 15_000 })
      .toBeGreaterThan(initialGuardianMentions);

    const editorText = await getEditorText(page);
    expect(editorText.length).toBeGreaterThan(initialTextLength);

    await startExportAndWaitForCompletion(page, 'pdf', 10 * 60 * 1000);
  });
});
