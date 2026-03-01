import { Router, Response } from 'express';
import { z } from 'zod';
import { streamText, generateText } from 'ai';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { chatRateLimit, blockGenRateLimit, autoFillRateLimit, aiValidationRateLimit, wizardRateLimit } from '../middleware/ai-rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import * as aiSettings from '../services/ai-settings.service.js';
import * as aiChat from '../services/ai-chat.service.js';
import * as aiContent from '../services/ai-content.service.js';
import * as aiWizard from '../services/ai-wizard.service.js';
import { createModel, validateApiKey, validateConnection, SUPPORTED_MODELS, type AiProvider } from '../services/ai-provider.service.js';
import { prisma } from '../config/database.js';
import type { WizardEvent, WizardGeneratedSection } from '@dnd-booker/shared';

const SUPPORTED_BLOCK_TYPES = aiContent.getSupportedBlockTypes();
const MAX_CHAT_CONTEXT_MESSAGES = 30;
const MAX_SESSION_MESSAGES = 200; // hard cap per session
const MAX_AI_RESPONSE_TOKENS = 4096;
const MAX_STORED_CONTENT = 100_000;

// --- Settings routes (no project context) ---
export const aiSettingsRoutes = Router();
aiSettingsRoutes.use(requireAuth);

aiSettingsRoutes.get('/settings', asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    const settings = await aiSettings.getAiSettings(req.userId!);
    if (!settings) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ ...settings, supportedModels: SUPPORTED_MODELS });
  } catch (err) {
    console.error('[AI] Failed to get settings:', err);
    res.status(500).json({ error: 'Failed to load AI settings.' });
  }
}));

const saveSettingsSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'ollama']),
  model: z.string().min(1).max(100),
  apiKey: z.string().min(10).max(300).optional(),
  baseUrl: z.string().url().max(500).optional(),
}).refine(
  (data) => {
    if (data.provider === 'ollama') return true;
    return SUPPORTED_MODELS[data.provider]?.includes(data.model);
  },
  { message: 'Unsupported model for the selected provider', path: ['model'] }
);

aiSettingsRoutes.post('/settings', asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = saveSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }
  try {
    await aiSettings.saveAiSettings(req.userId!, parsed.data);
    console.log(`[AUDIT] User ${req.userId} updated AI settings (provider=${parsed.data.provider}, model=${parsed.data.model}, keyChanged=${!!parsed.data.apiKey})`);
    res.json({ success: true });
  } catch (err) {
    console.error('[AI] Failed to save settings:', err);
    res.status(500).json({ error: 'Failed to save AI settings.' });
  }
}));

aiSettingsRoutes.delete('/settings/key', asyncHandler(async (req: AuthRequest, res: Response) => {
  try {
    await aiSettings.removeApiKey(req.userId!);
    console.log(`[AUDIT] User ${req.userId} removed AI API key`);
    res.json({ success: true });
  } catch (err) {
    console.error('[AI] Failed to remove API key:', err);
    res.status(500).json({ error: 'Failed to remove API key.' });
  }
}));

const validateKeySchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  apiKey: z.string().min(10).max(300),
});

aiSettingsRoutes.post('/settings/validate', aiValidationRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = validateKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }
  try {
    const valid = await validateApiKey(parsed.data.provider, parsed.data.apiKey);
    res.json({ valid });
  } catch (err: unknown) {
    console.error('[AI] Key validation error:', err);
    // Distinguish auth errors (invalid key) from infrastructure errors
    const isAuthError = err instanceof Error && (
      err.message.includes('401') || err.message.includes('403') ||
      err.message.includes('Unauthorized') || err.message.includes('invalid')
    );
    if (isAuthError) {
      res.json({ valid: false });
    } else {
      res.status(500).json({ error: 'Could not validate key. Please try again.' });
    }
  }
}));

const validateOllamaSchema = z.object({
  baseUrl: z.string().url(),
});

aiSettingsRoutes.post('/settings/validate-ollama', aiValidationRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = validateOllamaSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }
  try {
    const result = await validateConnection(parsed.data.baseUrl);
    res.json(result);
  } catch (err) {
    console.error('[AI] Ollama validation error:', err);
    res.status(500).json({ error: 'Could not connect to Ollama.' });
  }
}));

// --- Block generation routes (no project context) ---
export const aiGenerateRoutes = Router();
aiGenerateRoutes.use(requireAuth);

const generateBlockSchema = z.object({
  blockType: z.string().min(1).refine(
    (t) => SUPPORTED_BLOCK_TYPES.includes(t),
    { message: 'Unsupported block type' }
  ),
  prompt: z.string().min(1).max(2000),
});

aiGenerateRoutes.post('/generate-block', blockGenRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = generateBlockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const { blockType, prompt } = parsed.data;

  try {
    const model = await getModelForUser(req.userId!);
    if (!model) {
      res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
      return;
    }

    const systemPrompt = aiContent.buildSystemPrompt();
    const blockPrompt = aiContent.buildBlockPrompt(blockType, prompt);

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: blockPrompt,
      maxOutputTokens: MAX_AI_RESPONSE_TOKENS,
    });

    const attrs = aiContent.parseBlockResponse(text, blockType);
    if (!attrs) {
      res.status(422).json({ error: 'Failed to parse AI response into valid block data.' });
      return;
    }

    res.json({ attrs });
  } catch (err: unknown) {
    console.error('[AI] Block generation failed:', err);
    res.status(500).json({ error: 'AI generation failed. Please try again.' });
  }
}));

const autoFillSchema = z.object({
  blockType: z.string().min(1).refine(
    (t) => SUPPORTED_BLOCK_TYPES.includes(t),
    { message: 'Unsupported block type' }
  ),
  currentAttrs: z.record(
    z.union([z.string().max(5000), z.number(), z.boolean(), z.null()])
  ).refine((obj) => Object.keys(obj).length <= 50, 'Too many attributes'),
});

aiGenerateRoutes.post('/autofill', autoFillRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = autoFillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const { blockType, currentAttrs } = parsed.data;

  try {
    const model = await getModelForUser(req.userId!);
    if (!model) {
      res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
      return;
    }

    const systemPrompt = aiContent.buildSystemPrompt();
    const autoFillPrompt = aiContent.buildAutoFillPrompt(blockType, currentAttrs);

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: autoFillPrompt,
      maxOutputTokens: MAX_AI_RESPONSE_TOKENS,
    });

    const suggestions = aiContent.parseBlockResponse(text, blockType);
    if (!suggestions) {
      res.status(422).json({ error: 'Failed to parse AI suggestions.' });
      return;
    }

    res.json({ suggestions });
  } catch (err: unknown) {
    console.error('[AI] Auto-fill failed:', err);
    res.status(500).json({ error: 'AI auto-fill failed. Please try again.' });
  }
}));

// --- Chat routes (project-scoped) ---
export const aiChatRoutes = Router({ mergeParams: true });
aiChatRoutes.use(requireAuth);

aiChatRoutes.get('/ai/chat', validateUuid('projectId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  try {
    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const session = await aiChat.getSessionByProject(projectId, req.userId!);
    res.json({ messages: session?.messages ?? [] });
  } catch (err) {
    console.error('[AI] Failed to get chat history:', err);
    res.status(500).json({ error: 'Failed to load chat history.' });
  }
}));

const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000),
});

aiChatRoutes.post('/ai/chat', validateUuid('projectId'), chatRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = chatMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  let savedUserMsgId: string | null = null;

  try {
    // Verify project ownership
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const model = await getModelForUser(req.userId!);
    if (!model) {
      res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
      return;
    }

    // Get or create session, check message limit
    const session = await aiChat.getOrCreateSession(projectId, req.userId!);
    const messageCount = await aiChat.getMessageCount(session.id);
    if (messageCount >= MAX_SESSION_MESSAGES) {
      res.status(429).json({ error: 'Chat session message limit reached. Please clear chat history to continue.' });
      return;
    }
    const savedMsg = await aiChat.addMessage(session.id, 'user', parsed.data.message);
    savedUserMsgId = savedMsg.id;

    // Build message history — limited to recent messages for context window safety
    const history = await aiChat.getRecentMessages(session.id, MAX_CHAT_CONTEXT_MESSAGES);
    const messages = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const systemPrompt = aiContent.buildSystemPrompt(project.title);

    // Abort the AI call if the client disconnects
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    // Stream the response
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      maxOutputTokens: MAX_AI_RESPONSE_TOKENS,
      abortSignal: abortController.signal,
    });

    // Collect the full response for persistence
    let fullResponse = '';
    const stream = result.textStream;

    // Set up streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break;
      fullResponse += chunk;
      res.write(chunk);
    }

    res.end();

    // Persist the assistant message after streaming (truncate if absurdly long)
    await aiChat.addMessage(session.id, 'assistant', fullResponse.slice(0, MAX_STORED_CONTENT));
  } catch (err: unknown) {
    console.error('[AI] Chat stream error:', err);
    if (!res.headersSent) {
      // Clean up the orphaned user message on pre-stream failure
      if (savedUserMsgId) {
        await prisma.aiChatMessage.delete({ where: { id: savedUserMsgId } }).catch((cleanupErr) => {
          console.error('[AI] Failed to clean up orphaned user message:', cleanupErr);
        });
      }
      res.status(500).json({ error: 'Chat failed. Please try again.' });
    } else {
      // Mid-stream failure: signal to client and don't persist partial response
      res.write('\n\n[Response interrupted. Please try again.]');
      res.end();
    }
  }
}));

aiChatRoutes.delete('/ai/chat', validateUuid('projectId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  try {
    // Verify project ownership before deleting chat
    const project = await prisma.project.findFirst({
      where: { id: projectId, userId: req.userId! },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    await aiChat.clearSessionByProject(projectId, req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error('[AI] Failed to clear chat:', err);
    res.status(500).json({ error: 'Failed to clear chat history.' });
  }
}));

// --- Wizard routes (project-scoped) ---
export const aiWizardRoutes = Router({ mergeParams: true });
aiWizardRoutes.use(requireAuth);

/** Helper to send an SSE event (newline-delimited JSON) */
function sendWizardEvent(res: Response, event: WizardEvent) {
  res.write(JSON.stringify(event) + '\n');
}

/** Helper to set up SSE response headers */
function setupSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

// GET /projects/:projectId/ai/wizard — get current wizard session
aiWizardRoutes.get('/ai/wizard', validateUuid('projectId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const session = await aiWizard.getSession(projectId, req.userId!);
  res.json({ session: session ?? null });
}));

// POST /projects/:projectId/ai/wizard/start — start wizard, generate questions
const wizardStartSchema = z.object({
  projectType: z.string().min(1).max(100).optional(),
});

aiWizardRoutes.post('/ai/wizard/start', validateUuid('projectId'), wizardRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = wizardStartSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const model = await getModelForUser(req.userId!);
  if (!model) {
    res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
    return;
  }

  // Delete any existing wizard session and create fresh
  await aiWizard.deleteSession(projectId, req.userId!);
  const session = await aiWizard.getOrCreateSession(projectId, req.userId!);

  setupSSE(res);

  try {
    const projectType = parsed.data?.projectType || project.type.replace('_', ' ');
    const questions = await aiWizard.generateQuestions(projectType, model);

    await aiWizard.updateSession(session.id, { phase: 'questionnaire' });

    sendWizardEvent(res, { type: 'questions', questions });
    sendWizardEvent(res, { type: 'done' });
  } catch (err: unknown) {
    console.error('[AI Wizard] Failed to generate questions:', err);
    await aiWizard.updateSession(session.id, { errorMsg: 'Failed to generate questions' });
    sendWizardEvent(res, { type: 'error', error: 'Failed to generate questions. Please try again.' });
  }

  res.end();
}));

// POST /projects/:projectId/ai/wizard/parameters — submit answers, generate outline
const wizardParametersSchema = z.object({
  projectType: z.string().min(1).max(100),
  answers: z.record(z.string().max(2000)),
});

aiWizardRoutes.post('/ai/wizard/parameters', validateUuid('projectId'), wizardRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = wizardParametersSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const model = await getModelForUser(req.userId!);
  if (!model) {
    res.status(400).json({ error: 'AI not configured.' });
    return;
  }

  const session = await aiWizard.getSession(projectId, req.userId!);
  if (!session) {
    res.status(404).json({ error: 'No wizard session found. Please start the wizard first.' });
    return;
  }

  const params = parsed.data;

  setupSSE(res);

  try {
    // Save parameters
    await aiWizard.updateSession(session.id, {
      parameters: params,
      phase: 'outline',
    });

    // Generate outline
    const outline = await aiWizard.generateOutline(params, model);

    await aiWizard.updateSession(session.id, { outline });

    sendWizardEvent(res, { type: 'outline', outline });
    sendWizardEvent(res, { type: 'done' });
  } catch (err: unknown) {
    console.error('[AI Wizard] Failed to generate outline:', err);
    await aiWizard.updateSession(session.id, { errorMsg: 'Failed to generate outline' });
    sendWizardEvent(res, { type: 'error', error: 'Failed to generate outline. Please try again.' });
  }

  res.end();
}));

// POST /projects/:projectId/ai/wizard/generate — generate all sections
const wizardGenerateSchema = z.object({
  outline: z.object({
    adventureTitle: z.string().min(1),
    summary: z.string(),
    sections: z.array(z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      blockHints: z.array(z.string()),
      sortOrder: z.number(),
    })),
  }),
});

aiWizardRoutes.post('/ai/wizard/generate', validateUuid('projectId'), wizardRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = wizardGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const model = await getModelForUser(req.userId!);
  if (!model) {
    res.status(400).json({ error: 'AI not configured.' });
    return;
  }

  const session = await aiWizard.getSession(projectId, req.userId!);
  if (!session) {
    res.status(404).json({ error: 'No wizard session found.' });
    return;
  }

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  const outline = parsed.data.outline;

  // Save the (potentially user-edited) outline
  await aiWizard.updateSession(session.id, {
    outline,
    phase: 'generating',
    sections: [],
    progress: 0,
  });

  setupSSE(res);

  const generatedSections: WizardGeneratedSection[] = [];
  const previousSummaries: string[] = [];
  const totalSections = outline.sections.length;

  for (let idx = 0; idx < totalSections; idx++) {
    const section = outline.sections[idx];

    if (abortController.signal.aborted) break;

    sendWizardEvent(res, { type: 'section_start', sectionId: section.id, title: section.title });

    try {
      const result = await aiWizard.generateSection(
        outline,
        section,
        previousSummaries,
        model,
        abortController.signal,
      );

      const genSection: WizardGeneratedSection = {
        sectionId: section.id,
        title: section.title,
        status: 'completed',
        content: result.content,
        markdown: result.markdown,
      };

      generatedSections.push(genSection);
      previousSummaries.push(aiWizard.summarizeSection(result.markdown));

      const progress = Math.round(((idx + 1) / totalSections) * 100);

      // Persist after each section for resume support
      await aiWizard.updateSession(session.id, {
        sections: generatedSections,
        progress,
      });

      sendWizardEvent(res, { type: 'section_done', sectionId: section.id });
      sendWizardEvent(res, { type: 'progress', percent: progress });
    } catch (err: unknown) {
      if (abortController.signal.aborted) break;

      console.error(`[AI Wizard] Failed to generate section ${section.id}:`, err);

      const genSection: WizardGeneratedSection = {
        sectionId: section.id,
        title: section.title,
        status: 'failed',
        content: null,
        error: 'Generation failed',
      };
      generatedSections.push(genSection);

      await aiWizard.updateSession(session.id, { sections: generatedSections });

      sendWizardEvent(res, {
        type: 'section_error',
        sectionId: section.id,
        error: 'Failed to generate this section.',
      });
    }
  }

  if (!abortController.signal.aborted) {
    await aiWizard.updateSession(session.id, { phase: 'review', progress: 100 });
    sendWizardEvent(res, { type: 'done' });
  }

  res.end();
}));

// POST /projects/:projectId/ai/wizard/apply — create documents from selected sections
const wizardApplySchema = z.object({
  sectionIds: z.array(z.string()).min(1),
});

aiWizardRoutes.post('/ai/wizard/apply', validateUuid('projectId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = wizardApplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const session = await aiWizard.getSession(projectId, req.userId!);
  if (!session) {
    res.status(404).json({ error: 'No wizard session found.' });
    return;
  }

  const sections = (session.sections ?? []) as unknown as WizardGeneratedSection[];

  try {
    const docs = await aiWizard.applyToProject(projectId, sections, parsed.data.sectionIds);

    // Mark wizard as done
    await aiWizard.updateSession(session.id, { phase: 'done' });

    res.json({ documents: docs });
  } catch (err: unknown) {
    console.error('[AI Wizard] Failed to apply sections:', err);
    res.status(500).json({ error: 'Failed to create documents.' });
  }
}));

// DELETE /projects/:projectId/ai/wizard — cancel/delete wizard session
aiWizardRoutes.delete('/ai/wizard', validateUuid('projectId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  await aiWizard.deleteSession(projectId, req.userId!);
  res.json({ success: true });
}));

// --- Shared helper ---
async function getModelForUser(userId: string) {
  const settings = await aiSettings.getAiSettings(userId);
  if (!settings?.provider) return null;

  // Ollama doesn't require an API key
  if (settings.provider === 'ollama') {
    return createModel(settings.provider, 'ollama', settings.model ?? undefined, settings.baseUrl ?? undefined);
  }

  if (!settings.hasApiKey) return null;
  const apiKey = await aiSettings.getDecryptedApiKey(userId);
  if (!apiKey) return null;

  return createModel(settings.provider, apiKey, settings.model ?? undefined);
}
