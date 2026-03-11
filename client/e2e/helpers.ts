import { Page, expect } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// Test credentials (Docker DB test account)
export const TEST_EMAIL = 'm7.ga.77@gmail.com';
export const TEST_PASSWORD = '2Rickie2!';
const AI_PROGRESS_POLL_MS = 1_000;
const DEFAULT_AI_STALL_TIMEOUT_MS = 120_000;
const DEFAULT_AI_MAX_WAIT_MS = 30 * 60 * 1_000;
const OLLAMA_LIVENESS_POLL_MS = 10_000;
const TEST_OLLAMA_MODEL = 'qwen3.5:9b';
const execFileAsync = promisify(execFile);

async function isOllamaGenerationActive(model = TEST_OLLAMA_MODEL): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync('ollama', ['ps']);
    return stdout.includes(model);
  } catch {
    return false;
  }
}

/**
 * Navigate to the dashboard and retry once if the first load stalls.
 */
export async function goToDashboard(page: Page) {
  await page.goto('/');
  const newProjectBtn = page.getByRole('button', { name: 'New Project' });
  const visible = await newProjectBtn.isVisible({ timeout: 10_000 }).catch(() => false);
  if (!visible) {
    await page.reload();
    await expect(newProjectBtn).toBeVisible({ timeout: 15_000 });
  }
}

/**
 * Login via the UI and wait for dashboard to load.
 */
export async function login(page: Page) {
  await page.goto('/');

  const newProjectBtn = page.getByRole('button', { name: 'New Project' });
  if (await newProjectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    return;
  }

  await page.fill('input[type="email"]', TEST_EMAIL);
  await page.fill('input[type="password"]', TEST_PASSWORD);
  await page.click('button[type="submit"]');

  await expect(newProjectBtn).toBeVisible({ timeout: 10_000 });
}

/**
 * Create a new project from the dashboard with the given template.
 */
export async function createProject(
  page: Page,
  name: string,
  template: 'one-shot' | 'campaign' | 'supplement' | 'sourcebook' | 'blank' = 'one-shot',
) {
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page.getByText('Choose a Template').first()).toBeVisible({ timeout: 5000 });

  if (template === 'blank') {
    await page.getByText('start with a blank project').click();
  } else {
    const templateIndex: Record<'one-shot' | 'campaign' | 'supplement' | 'sourcebook', number> = {
      campaign: 0,
      'one-shot': 1,
      supplement: 2,
      sourcebook: 3,
    };
    await page.getByRole('button', { name: 'Use Template' }).nth(templateIndex[template]).click();
  }

  await expect(page.getByText('Project Details').first()).toBeVisible({ timeout: 5000 });
  await page.locator('input[placeholder*="title"]').first().fill(name);
  await page.getByRole('button', { name: 'Create Project' }).click();
  await ensureEditorReady(page);
}

/**
 * Open a named project from the dashboard, or create it if it does not exist yet.
 */
export async function openProjectByTitleOrCreate(
  page: Page,
  name: string,
  template: 'one-shot' | 'campaign' | 'supplement' | 'sourcebook' | 'blank' = 'one-shot',
) {
  await goToDashboard(page);

  const existingProject = page.locator('main h3').filter({ hasText: name }).first();
  const hasExistingProject = await existingProject.isVisible({ timeout: 3_000 }).catch(() => false);

  if (hasExistingProject) {
    await existingProject.click();
    await ensureEditorReady(page);
    await clearGenerationRunPanel(page);
    return;
  }

  await createProject(page, name, template);
  await clearGenerationRunPanel(page);
}

/**
 * Open the first project card from the dashboard.
 */
export async function openFirstProject(page: Page) {
  const projectHeading = page.locator('main h3').first();
  await projectHeading.click();
  await ensureEditorReady(page);
}

async function ensureEditorReady(page: Page) {
  const editor = page.locator('.ProseMirror').first();
  if (await editor.isVisible().catch(() => false)) {
    return;
  }

  const selectPrompt = page.getByText('Select a document from the sidebar to begin editing.').first();
  const readyState = await expect
    .poll(async () => {
      if (await editor.isVisible().catch(() => false)) return 'editor';
      if (await selectPrompt.isVisible().catch(() => false)) return 'select-document';
      return 'pending';
    }, { timeout: 15_000 })
    .not.toBe('pending')
    .then(async () => {
      if (await editor.isVisible().catch(() => false)) return 'editor';
      return 'select-document';
    });

  if (readyState === 'select-document') {
    const firstDocumentButton = page
      .getByRole('button', { name: /^(?!Back to Dashboard$)(?!Logout$).+/ })
      .first();
    await expect(firstDocumentButton).toBeVisible({ timeout: 5_000 });
    await firstDocumentButton.click();
  }

  await expect(editor).toBeVisible({ timeout: 15_000 });
}

/**
 * Ensure the AI chat panel is open.
 */
export async function openAiPanel(page: Page) {
  const textarea = page.locator('textarea').first();
  if (await textarea.isVisible({ timeout: 1000 }).catch(() => false)) {
    return;
  }
  await page.locator('button:has-text("AI"), [aria-label*="AI"]').first().click();
  await expect(page.locator('text=AI Assistant').first()).toBeVisible({ timeout: 5000 });
}

/**
 * Wait for an assistant response to finish streaming and become visible in chat.
 * Slow local inference is allowed; we only fail when progress stalls.
 */
export async function waitForAiResponse(page: Page, previousCount: number, stallTimeoutMs = DEFAULT_AI_STALL_TIMEOUT_MS) {
  const messages = page.locator('.ai-markdown');
  const stopButton = page.getByRole('button', { name: 'Stop generating' }).first();
  const spinner = page.locator('.animate-bounce').first();
  const editBanner = page.locator('text=/operation|applied|updated/i').first();
  const chatError = page.locator('text=/Chat failed\\.|Response interrupted\\.|Session expired\\.|Failed to load chat history\\./i').first();
  const startTime = Date.now();
  let lastProgressAt = startTime;
  let lastKnownLiveAt = startTime;
  let lastOllamaPollAt = 0;
  let lastSignature = '';

  while (Date.now() - startTime < DEFAULT_AI_MAX_WAIT_MS) {
    const now = Date.now();
    const hasStop = await stopButton.isVisible().catch(() => false);
    const hasSpinner = await spinner.isVisible().catch(() => false);
    const hasEditBanner = await editBanner.isVisible().catch(() => false);
    const hasChatError = await chatError.isVisible().catch(() => false);
    const count = await messages.count();
    const newestMessageText = count > 0
      ? await messages.last().innerText().catch(() => '')
      : '';

    if (hasChatError) {
      const errorText = await chatError.innerText().catch(() => 'Chat failed. Please try again.');
      throw new Error(errorText.trim() || 'Chat failed. Please try again.');
    }

    if (hasEditBanner || (count > previousCount && !hasStop && !hasSpinner && newestMessageText.trim().length > 0)) {
      return;
    }

    const signature = JSON.stringify({
      count,
      newestMessageLength: newestMessageText.length,
      newestMessageTail: newestMessageText.slice(-120),
      hasStop,
      hasSpinner,
      hasEditBanner,
      hasChatError,
    });

    if (signature !== lastSignature) {
      lastSignature = signature;
      lastProgressAt = now;
    }

    if (now - lastOllamaPollAt >= OLLAMA_LIVENESS_POLL_MS) {
      lastOllamaPollAt = now;
      if (await isOllamaGenerationActive()) {
        lastKnownLiveAt = now;
      }
    }

    if (now - Math.max(lastProgressAt, lastKnownLiveAt) > stallTimeoutMs) {
      throw new Error(`AI response stalled for more than ${Math.round(stallTimeoutMs / 1000)}s`);
    }

    await page.waitForTimeout(AI_PROGRESS_POLL_MS);
  }

  throw new Error(`AI response exceeded the hard ceiling of ${Math.round(DEFAULT_AI_MAX_WAIT_MS / 60_000)} minutes`);
}

/**
 * Wait for chat history to reload after the AI panel remounts.
 */
export async function waitForChatHistory(page: Page, minimumCount: number, timeoutMs = 15_000) {
  const messages = page.locator('.ai-markdown');
  await expect
    .poll(async () => (await messages.count()) >= minimumCount, { timeout: timeoutMs })
    .toBe(true);
}

/**
 * Send a message in the AI chat and wait for the response to complete streaming.
 */
export async function sendAiMessage(page: Page, message: string, stallTimeoutMs = DEFAULT_AI_STALL_TIMEOUT_MS) {
  await openAiPanel(page);
  const input = page.locator('textarea[placeholder*="Ask"], textarea[placeholder*="message"], input[placeholder*="Ask"]').first();
  const messages = page.locator('.ai-markdown');
  const previousCount = await messages.count();
  await input.fill(message);
  await input.press('Enter');
  await waitForAiResponse(page, previousCount, stallTimeoutMs);
}

/**
 * Clear the current AI chat history if the control is available.
 */
export async function clearAiChatHistory(page: Page) {
  await openAiPanel(page);
  const clearButton = page.getByRole('button', { name: 'Clear chat history' }).first();
  if (await clearButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await clearButton.click();
    await expect(page.locator('.ai-markdown')).toHaveCount(0, { timeout: 5_000 });
  }
}

/**
 * Open the autonomous generation dialog from the editor toolbar.
 */
export async function openGenerateDialog(page: Page) {
  await openAiPanel(page);
  const generateButton = page.getByRole('button', { name: 'Generate Content' });
  await expect(generateButton).toBeVisible({ timeout: 5000 });
  await generateButton.click();

  const dialog = page.getByRole('dialog', { name: 'Generate Content' });
  await expect(dialog).toBeVisible({ timeout: 5000 });
  return dialog;
}

/**
 * Start an autonomous generation run using the editor dialog.
 */
export async function startAutonomousGeneration(
  page: Page,
  prompt: string,
  options?: {
    mode?: 'one shot' | 'module' | 'campaign' | 'sourcebook';
    quality?: 'Quick Draft' | 'Polished';
    pageTarget?: number;
  },
) {
  const dialog = await openGenerateDialog(page);
  const mode = options?.mode ?? 'one shot';
  const quality = options?.quality ?? 'Quick Draft';

  await dialog.locator('textarea').fill(prompt);

  if (mode !== 'one shot') {
    await dialog.getByRole('button', { name: mode }).click();
  }

  if (quality !== 'Quick Draft') {
    await dialog.getByRole('button', { name: quality }).click();
  }

  if (options?.pageTarget !== undefined) {
    await dialog.locator('input[type="number"]').fill(String(options.pageTarget));
  }

  await dialog.getByRole('button', { name: 'Generate' }).click();
  await expect(dialog).not.toBeVisible({ timeout: 10_000 });
}

/**
 * Wait for either an active generation stage or a terminal generation state.
 */
export async function waitForGenerationRun(page: Page, timeoutMs = 30_000) {
  const indicator = page.getByText(
    /Queued|Planning Campaign|Creating Assets|Writing Chapters|Quality Review|Revising Content|Assembling Documents|Complete|Cancelled|Failed|Paused/,
  ).first();
  await expect(indicator).toBeVisible({ timeout: timeoutMs });
  return indicator;
}

/**
 * Let a generation run settle, dismissing it if it completes or cancelling it if it stays active.
 */
export async function settleGenerationRun(page: Page, completionTimeoutMs = 45_000) {
  const dismissButton = page.getByRole('button', { name: 'Dismiss' }).first();
  if (await dismissButton.isVisible({ timeout: completionTimeoutMs }).catch(() => false)) {
    await dismissButton.click();
    await expect(dismissButton).not.toBeVisible({ timeout: 5000 });
    return 'dismissed';
  }

  const cancelButton = page.getByRole('button', { name: 'Cancel' }).first();
  if (await cancelButton.isVisible({ timeout: 5000 }).catch(() => false)) {
    await cancelButton.click();
    await expect(dismissButton).toBeVisible({ timeout: 10_000 });
    await dismissButton.click();
    await expect(dismissButton).not.toBeVisible({ timeout: 5000 });
    return 'cancelled';
  }

  return 'running';
}

/**
 * Clear any stale generation panel before starting a new run.
 */
export async function clearGenerationRunPanel(page: Page) {
  const dismissButton = page.getByRole('button', { name: 'Dismiss' }).first();
  if (await dismissButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await dismissButton.click();
    await expect(dismissButton).not.toBeVisible({ timeout: 5_000 });
    return;
  }

  const cancelButton = page.getByRole('button', { name: 'Cancel' }).first();
  if (await cancelButton.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await cancelButton.click();
    await expect(dismissButton).toBeVisible({ timeout: 10_000 });
    await dismissButton.click();
    await expect(dismissButton).not.toBeVisible({ timeout: 5_000 });
  }
}

/**
 * Wait for a real completed generation run, then dismiss the panel.
 */
export async function waitForGenerationCompletion(page: Page, timeoutMs = 240_000) {
  const dismissButton = page.getByRole('button', { name: 'Dismiss' }).first();
  const completeStatus = page.getByText('Complete', { exact: true }).first();
  const cancelledStatus = page.getByText('Cancelled', { exact: true }).first();
  const failedStatus = page.getByText('Failed', { exact: true }).first();

  await expect
    .poll(async () => {
      if (await failedStatus.isVisible().catch(() => false)) return 'failed';
      if (await cancelledStatus.isVisible().catch(() => false)) return 'cancelled';
      const hasCompleteStatus = await completeStatus.isVisible().catch(() => false);
      const hasDismissButton = await dismissButton.isVisible().catch(() => false);
      if (hasCompleteStatus && hasDismissButton) return 'completed';
      return 'running';
    }, { timeout: timeoutMs })
    .toBe('completed');

  await dismissButton.click();
  await expect(dismissButton).not.toBeVisible({ timeout: 5_000 });
}

/**
 * Insert the first generated block card from the AI panel and optionally verify text appears in the editor.
 */
export async function insertFirstGeneratedBlock(
  page: Page,
  options?: {
    timeoutMs?: number;
  },
) {
  const timeoutMs = options?.timeoutMs ?? 10_000;
  const editor = page.locator('.ProseMirror').first();
  const insertButton = page.getByRole('button', { name: 'Insert' }).last();
  const initialMarkup = await editor.evaluate((el) => el.innerHTML);

  const editorTail = page.locator('.ProseMirror p').last();
  if (await editorTail.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await editorTail.click();
  } else {
    await editor.click();
  }

  await expect(insertButton).toBeVisible({ timeout: timeoutMs });
  await insertButton.click();
  await page.waitForTimeout(2000);

  await expect
    .poll(async () => await editor.evaluate((el, before) => el.innerHTML !== before, initialMarkup), {
      timeout: 15_000,
    })
    .toBe(true);
}

/**
 * Start an export from the dialog and wait for a completed export job.
 */
export async function startExportAndWaitForCompletion(
  page: Page,
  format: 'pdf' | 'print_pdf' | 'epub' = 'pdf',
  timeoutMs = 120_000,
) {
  await page.getByRole('button', { name: 'Export project' }).click();
  await expect(page.getByText('Export Project').first()).toBeVisible({ timeout: 5_000 });

  if (format !== 'pdf') {
    const formatLabel =
      format === 'print_pdf' ? 'Print-Ready PDF' : 'ePub';
    await page.getByLabel(formatLabel).check();
  }

  await page.getByRole('button', { name: 'Export', exact: true }).click();

  const completed = page.getByText('Export Complete').first();
  const failed = page.getByText('Export Failed').first();

  await expect
    .poll(async () => {
      if (await completed.isVisible().catch(() => false)) return 'completed';
      if (await failed.isVisible().catch(() => false)) return 'failed';
      return 'pending';
    }, { timeout: timeoutMs })
    .toBe('completed');

  await expect(page.getByRole('link', { name: 'Download' }).first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Wait for legacy wizard sections or a terminal autonomous generation state.
 */
export async function waitForWizardComplete(page: Page, timeoutMs = 180_000) {
  await expect(
    page.locator('button').filter({ hasText: /Insert .*Section|Insert All|Dismiss/ }).first(),
  ).toBeVisible({ timeout: timeoutMs });
}

/**
 * Click the legacy section-insert button if it is visible.
 */
export async function insertAllSections(page: Page) {
  const insertBtn = page.locator('button').filter({ hasText: /Insert .*Section|Insert All/ }).first();
  if (await insertBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await insertBtn.click();
    await page.waitForTimeout(2000);
  }
}

/**
 * Count blocks of a specific type in the editor.
 */
export async function countBlocks(page: Page, blockType: string): Promise<number> {
  const selectorByBlockType: Record<string, string> = {
    statBlock: 'div[data-stat-block]',
  };
  return page.locator(selectorByBlockType[blockType] ?? `[data-type="${blockType}"], .node-${blockType}`).count();
}

/**
 * Get the editor's text content (visible text).
 */
export async function getEditorText(page: Page): Promise<string> {
  return page.locator('.ProseMirror').first().innerText();
}
