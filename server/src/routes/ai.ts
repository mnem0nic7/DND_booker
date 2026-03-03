import { Router, Response } from 'express';
import { z } from 'zod';
import { streamText, generateText } from 'ai';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { chatRateLimit, blockGenRateLimit, autoFillRateLimit, aiValidationRateLimit, wizardRateLimit, memoryRateLimit } from '../middleware/ai-rate-limit.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import * as aiSettings from '../services/ai-settings.service.js';
import * as aiChat from '../services/ai-chat.service.js';
import * as aiContent from '../services/ai-content.service.js';
import * as aiWizard from '../services/ai-wizard.service.js';
import * as aiPlanner from '../services/ai-planner.service.js';
import * as aiMemoryService from '../services/ai-memory.service.js';
import { createModel, validateApiKey, validateConnection, SUPPORTED_MODELS, type AiProvider } from '../services/ai-provider.service.js';
import { prisma } from '../config/database.js';
import type { WizardEvent, WizardGeneratedSection } from '@dnd-booker/shared';

const SUPPORTED_BLOCK_TYPES = aiContent.getSupportedBlockTypes();
const MAX_CHAT_CONTEXT_MESSAGES = 30;
const MAX_SESSION_MESSAGES = 200; // hard cap per session
const MAX_AI_RESPONSE_TOKENS = 4096;
const MAX_OLLAMA_RESPONSE_TOKENS = 2048;
const MIN_OUTPUT_TOKENS = 64; // floor to prevent Ollama "below minimum" errors
const MAX_STORED_CONTENT = 100_000;
const MAX_SSE_BYTES = 512_000; // 500KB cap on SSE stream output

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

// --- Global memory routes (user-scoped, no project) ---

// GET /ai/memory — get global (non-project) memory items
aiSettingsRoutes.get('/memory', asyncHandler(async (req: AuthRequest, res: Response) => {
  const items = await aiMemoryService.getMemoryItems(req.userId!);
  res.json({ items });
}));

const globalRememberSchema = z.object({
  type: z.enum(['preference', 'project_fact', 'constraint', 'decision', 'glossary']),
  content: z.string().min(1).max(2000),
});

// POST /ai/memory/remember — store a global preference
aiSettingsRoutes.post('/memory/remember', memoryRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = globalRememberSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const item = await aiMemoryService.addMemoryItem(req.userId!, {
    type: parsed.data.type,
    content: parsed.data.content,
    projectId: null,
    source: 'explicit',
  });
  res.json({ item });
}));

const globalForgetSchema = z.object({
  itemId: z.string().uuid(),
});

// POST /ai/memory/forget — remove a global memory item
aiSettingsRoutes.post('/memory/forget', memoryRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = globalForgetSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

  const removed = await aiMemoryService.removeMemoryItem(req.userId!, parsed.data.itemId);
  if (!removed) {
    res.status(404).json({ error: 'Memory item not found' });
    return;
  }
  res.json({ success: true });
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
    const result = await getModelForUser(req.userId!);
    if (!result) {
      res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
      return;
    }

    const systemPrompt = aiContent.buildSystemPrompt();
    const blockPrompt = aiContent.buildBlockPrompt(blockType, prompt);

    const { text } = await generateText({
      model: result.model,
      system: systemPrompt,
      prompt: blockPrompt,
      maxOutputTokens: result.maxOutputTokens,
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
    const result = await getModelForUser(req.userId!);
    if (!result) {
      res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
      return;
    }

    const systemPrompt = aiContent.buildSystemPrompt();
    const autoFillPrompt = aiContent.buildAutoFillPrompt(blockType, currentAttrs);

    const { text } = await generateText({
      model: result.model,
      system: systemPrompt,
      prompt: autoFillPrompt,
      maxOutputTokens: result.maxOutputTokens,
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

const pageMetricSchema = z.object({
  page: z.number(),
  contentHeight: z.number(),
  pageHeight: z.number(),
  fillPercent: z.number(),
  isBlank: z.boolean(),
  isNearlyBlank: z.boolean(),
  boundaryType: z.enum(['pageBreak', 'autoGap', 'end']),
  nodeTypes: z.array(z.string()).max(10),
  firstHeading: z.string().nullable(),
});

const pageMetricsSchema = z.object({
  totalPages: z.number().max(500),
  pageSize: z.enum(['letter', 'a4', 'a5']),
  columnCount: z.number(),
  pageContentHeight: z.number(),
  pages: z.array(pageMetricSchema).max(500),
  blankPageCount: z.number(),
  nearlyBlankPageCount: z.number(),
});

const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000),
  pageMetrics: pageMetricsSchema.optional(),
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

    const userModel = await getModelForUser(req.userId!);
    if (!userModel) {
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

    // Load planning context and append to system prompt
    const planningCtx = await aiPlanner.buildPlanningContext(projectId, req.userId!);
    const documentOutline = aiContent.buildDocumentOutline(project.content);
    const documentTextSample = aiContent.buildDocumentTextSample(project.content);
    const systemPrompt = aiContent.buildSystemPrompt(project.title, documentOutline, documentTextSample, parsed.data.pageMetrics)
      + aiPlanner.buildPlanningPromptSection(planningCtx);

    // Abort the AI call if the client disconnects
    const abortController = new AbortController();
    req.on('close', () => abortController.abort());

    // Stream the response
    const streamResult = streamText({
      model: userModel.model,
      system: systemPrompt,
      messages,
      maxOutputTokens: userModel.maxOutputTokens,
      abortSignal: abortController.signal,
    });

    // Collect the full response for persistence
    let fullResponse = '';
    let totalBytes = 0;
    const stream = streamResult.textStream;

    // Set up streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break;
      totalBytes += Buffer.byteLength(chunk, 'utf8');
      if (totalBytes > MAX_SSE_BYTES) {
        res.write('\n\n[Stream limit reached]');
        break;
      }
      fullResponse += chunk;
      res.write(chunk);
    }

    res.end();

    // Process planning control blocks and persist cleaned response (post-stream)
    try {
      const { visibleText } = await aiPlanner.processAssistantResponse(
        fullResponse, projectId, req.userId!,
      );
      await aiChat.addMessage(session.id, 'assistant', visibleText.slice(0, MAX_STORED_CONTENT));
    } catch (postErr) {
      // Response already sent to client — log the error but save the raw response as fallback
      console.error('[AI] Post-stream processing failed:', postErr);
      await aiChat.addMessage(session.id, 'assistant', fullResponse.slice(0, MAX_STORED_CONTENT)).catch((saveErr) => {
        console.error('[AI] Failed to save fallback message:', saveErr);
      });
    }
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

// --- Planning state routes (project-scoped) ---

// GET /projects/:projectId/ai/state — return full planning state
aiChatRoutes.get('/ai/state', validateUuid('projectId'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const state = await aiPlanner.buildPlanningContext(projectId, req.userId!);
  res.json(state);
}));

const rememberSchema = z.object({
  type: z.enum(['preference', 'project_fact', 'constraint', 'decision', 'glossary']),
  content: z.string().min(1).max(2000),
});

// POST /projects/:projectId/ai/memory/remember — explicitly store a memory item
aiChatRoutes.post('/ai/memory/remember', validateUuid('projectId'), memoryRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = rememberSchema.safeParse(req.body);
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

  const item = await aiMemoryService.addMemoryItem(req.userId!, {
    type: parsed.data.type,
    content: parsed.data.content,
    projectId,
    source: 'explicit',
  });
  res.json({ item });
}));

const forgetSchema = z.object({
  itemId: z.string().uuid(),
});

// POST /projects/:projectId/ai/memory/forget — remove a memory item by ID
aiChatRoutes.post('/ai/memory/forget', validateUuid('projectId'), memoryRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = forgetSchema.safeParse(req.body);
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

  const removed = await aiMemoryService.removeMemoryItem(req.userId!, parsed.data.itemId);
  if (!removed) {
    res.status(404).json({ error: 'Memory item not found' });
    return;
  }
  res.json({ success: true });
}));

// POST /projects/:projectId/ai/plan/reset — clear the task plan
aiChatRoutes.post('/ai/plan/reset', validateUuid('projectId'), memoryRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  await aiMemoryService.resetTaskPlan(projectId, req.userId!);
  res.json({ success: true });
}));

// POST /projects/:projectId/ai/memory/reset — clear working memory
aiChatRoutes.post('/ai/memory/reset', validateUuid('projectId'), memoryRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;

  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: req.userId! },
  });
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  await aiMemoryService.resetWorkingMemory(projectId, req.userId!);
  res.json({ success: true });
}));

// --- Wizard routes (project-scoped) ---
export const aiWizardRoutes = Router({ mergeParams: true });
aiWizardRoutes.use(requireAuth);

/** Helper to send an SSE event (newline-delimited JSON). Returns bytes written. */
function sendWizardEvent(res: Response, event: WizardEvent): number {
  const data = JSON.stringify(event) + '\n';
  res.write(data);
  return Buffer.byteLength(data, 'utf8');
}

/** Helper to set up SSE response headers */
function setupSSE(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

/** Shared section-generation loop used by wizard/generate, auto-create, and chat-generate */
async function runSectionGeneration(
  res: Response,
  sessionId: string,
  outline: { adventureTitle: string; summary: string; sections: Array<{ id: string; title: string; description: string; blockHints: string[]; sortOrder: number }> },
  userModel: Awaited<ReturnType<typeof getModelForUser>> & {},
  abortController: AbortController,
): Promise<void> {
  const generatedSections: WizardGeneratedSection[] = [];
  const previousSummaries: string[] = [];
  const totalSections = outline.sections.length;
  let wizardBytes = 0;

  try {
    for (let idx = 0; idx < totalSections; idx++) {
      const section = outline.sections[idx];
      if (abortController.signal.aborted) break;
      if (wizardBytes > MAX_SSE_BYTES) {
        sendWizardEvent(res, { type: 'error', error: 'Stream size limit reached.' });
        break;
      }

      wizardBytes += sendWizardEvent(res, { type: 'section_start', sectionId: section.id, title: section.title });

      try {
        const result = await aiWizard.generateSection(
          outline,
          section,
          previousSummaries,
          userModel.model,
          abortController.signal,
          userModel.maxOutputTokens,
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

        await aiWizard.updateSession(sessionId, {
          sections: generatedSections,
          progress,
        });

        wizardBytes += sendWizardEvent(res, { type: 'section_done', sectionId: section.id });
        wizardBytes += sendWizardEvent(res, { type: 'progress', percent: progress });
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

        await aiWizard.updateSession(sessionId, { sections: generatedSections });

        wizardBytes += sendWizardEvent(res, {
          type: 'section_error',
          sectionId: section.id,
          error: 'Failed to generate this section.',
        });
      }
    }

    if (!abortController.signal.aborted) {
      await aiWizard.updateSession(sessionId, { phase: 'review', progress: 100 });
      sendWizardEvent(res, { type: 'done' });
    }
  } finally {
    if (!res.writableEnded) res.end();
  }
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

  const userModel = await getModelForUser(req.userId!);
  if (!userModel) {
    res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
    return;
  }

  // Reset wizard session atomically (avoids race on concurrent requests)
  const session = await aiWizard.resetAndCreateSession(projectId, req.userId!);

  setupSSE(res);

  try {
    const projectType = parsed.data?.projectType || project.type.replace('_', ' ');
    const questions = await aiWizard.generateQuestions(projectType, userModel.model);

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
  answers: z.record(z.string().max(2000))
    .refine((obj) => Object.keys(obj).length <= 20, 'Too many answers'),
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

  const userModel = await getModelForUser(req.userId!);
  if (!userModel) {
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
    const outline = await aiWizard.generateOutline(params, userModel.model);

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
    })).max(20),
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

  const userModel = await getModelForUser(req.userId!);
  if (!userModel) {
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
  await runSectionGeneration(res, session.id, outline, userModel, abortController);
}));

// POST /projects/:projectId/ai/wizard/apply — append generated sections to project content
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
    const updatedProject = await aiWizard.applyToProject(projectId, sections, parsed.data.sectionIds);

    // Mark wizard as done
    await aiWizard.updateSession(session.id, { phase: 'done' });

    res.json({ project: updatedProject });
  } catch (err: unknown) {
    console.error('[AI Wizard] Failed to apply sections:', err);
    res.status(500).json({ error: 'Failed to apply sections.' });
  }
}));

// POST /projects/:projectId/ai/wizard/auto-create — fully autonomous: prompt → outline → sections
const wizardAutoCreateSchema = z.object({
  prompt: z.string().min(1).max(5000),
});

aiWizardRoutes.post('/ai/wizard/auto-create', validateUuid('projectId'), wizardRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = wizardAutoCreateSchema.safeParse(req.body);
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

  const userModel = await getModelForUser(req.userId!);
  if (!userModel) {
    res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
    return;
  }

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  // Reset wizard session atomically
  const session = await aiWizard.resetAndCreateSession(projectId, req.userId!);

  setupSSE(res);

  // Phase 1: Generate outline from prompt
  sendWizardEvent(res, { type: 'phase', phase: 'outline' });

  let outline;
  try {
    outline = await aiWizard.generateOutlineFromPrompt(
      parsed.data.prompt,
      userModel.model,
      abortController.signal,
    );

    await aiWizard.updateSession(session.id, {
      outline,
      phase: 'generating',
      sections: [],
      progress: 0,
    });

    sendWizardEvent(res, { type: 'outline', outline });
  } catch (err: unknown) {
    if (abortController.signal.aborted) { res.end(); return; }
    console.error('[AI Wizard] Failed to generate outline:', err);
    await aiWizard.updateSession(session.id, { errorMsg: 'Failed to generate outline' });
    sendWizardEvent(res, { type: 'error', error: 'Failed to generate adventure outline. Please try again.' });
    res.end();
    return;
  }

  // Phase 2: Generate all sections
  await runSectionGeneration(res, session.id, outline, userModel, abortController);
}));

// POST /projects/:projectId/ai/wizard/chat-generate — generate adventure from chat outline
const wizardChatGenerateSchema = z.object({
  adventureTitle: z.string().min(1),
  summary: z.string(),
  sections: z.array(z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().optional().default(''),
    blockHints: z.array(z.string()).optional().default([]),
    sortOrder: z.number(),
  })).max(20),
});

aiWizardRoutes.post('/ai/wizard/chat-generate', validateUuid('projectId'), wizardRateLimit, asyncHandler(async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = wizardChatGenerateSchema.safeParse(req.body);
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

  const userModel = await getModelForUser(req.userId!);
  if (!userModel) {
    res.status(400).json({ error: 'AI not configured.' });
    return;
  }

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  const outline = parsed.data as {
    adventureTitle: string;
    summary: string;
    sections: Array<{
      id: string;
      title: string;
      description: string;
      blockHints: string[];
      sortOrder: number;
    }>;
  };

  // Reset wizard session atomically for persistence
  const session = await aiWizard.resetAndCreateSession(projectId, req.userId!);
  await aiWizard.updateSession(session.id, {
    outline,
    phase: 'generating',
    sections: [],
    progress: 0,
  });

  setupSSE(res);
  await runSectionGeneration(res, session.id, outline, userModel, abortController);
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

  const maxOutputTokens = Math.max(
    MIN_OUTPUT_TOKENS,
    settings.provider === 'ollama' ? MAX_OLLAMA_RESPONSE_TOKENS : MAX_AI_RESPONSE_TOKENS,
  );

  // Ollama doesn't require an API key
  if (settings.provider === 'ollama') {
    // Guard: if a non-Ollama model was saved (e.g. user switched from Anthropic), ignore it
    const ollamaModel = settings.model && !settings.model.startsWith('claude-') && !settings.model.startsWith('gpt-')
      ? settings.model
      : undefined;
    return { model: createModel(settings.provider, 'ollama', ollamaModel, settings.baseUrl ?? undefined), maxOutputTokens };
  }

  if (!settings.hasApiKey) return null;
  const apiKey = await aiSettings.getDecryptedApiKey(userId);
  if (!apiKey) return null;

  return { model: createModel(settings.provider, apiKey, settings.model ?? undefined), maxOutputTokens };
}
