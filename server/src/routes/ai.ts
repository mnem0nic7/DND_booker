import { Router, Response } from 'express';
import { z } from 'zod';
import { streamText, generateText } from 'ai';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { chatRateLimit, blockGenRateLimit, autoFillRateLimit } from '../middleware/ai-rate-limit.js';
import * as aiSettings from '../services/ai-settings.service.js';
import * as aiChat from '../services/ai-chat.service.js';
import * as aiContent from '../services/ai-content.service.js';
import { createModel, validateApiKey, SUPPORTED_MODELS, type AiProvider } from '../services/ai-provider.service.js';
import { prisma } from '../config/database.js';

const SUPPORTED_BLOCK_TYPES = aiContent.getSupportedBlockTypes();
const MAX_CHAT_CONTEXT_MESSAGES = 30;
const MAX_AI_RESPONSE_TOKENS = 4096;
const MAX_STORED_CONTENT = 100_000;

// --- Settings routes (no project context) ---
export const aiSettingsRoutes = Router();
aiSettingsRoutes.use(requireAuth);

aiSettingsRoutes.get('/settings', async (req: AuthRequest, res: Response) => {
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
});

const saveSettingsSchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  model: z.string().min(1),
  apiKey: z.string().min(10).max(300).optional(),
}).refine(
  (data) => SUPPORTED_MODELS[data.provider]?.includes(data.model),
  { message: 'Unsupported model for the selected provider', path: ['model'] }
);

aiSettingsRoutes.post('/settings', async (req: AuthRequest, res: Response) => {
  const parsed = saveSettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }
  try {
    await aiSettings.saveAiSettings(req.userId!, parsed.data);
    res.json({ success: true });
  } catch (err) {
    console.error('[AI] Failed to save settings:', err);
    res.status(500).json({ error: 'Failed to save AI settings.' });
  }
});

aiSettingsRoutes.delete('/settings/key', async (req: AuthRequest, res: Response) => {
  try {
    await aiSettings.removeApiKey(req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error('[AI] Failed to remove API key:', err);
    res.status(500).json({ error: 'Failed to remove API key.' });
  }
});

const validateKeySchema = z.object({
  provider: z.enum(['anthropic', 'openai']),
  apiKey: z.string().min(10).max(300),
});

aiSettingsRoutes.post('/settings/validate', async (req: AuthRequest, res: Response) => {
  const parsed = validateKeySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }
  try {
    const valid = await validateApiKey(parsed.data.provider, parsed.data.apiKey);
    res.json({ valid });
  } catch (err) {
    console.error('[AI] Key validation error:', err);
    res.json({ valid: false });
  }
});

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

aiGenerateRoutes.post('/generate-block', blockGenRateLimit, async (req: AuthRequest, res: Response) => {
  const parsed = generateBlockSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  const { blockType, prompt } = parsed.data;
  const model = await getModelForUser(req.userId!);
  if (!model) {
    res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
    return;
  }

  try {
    const systemPrompt = aiContent.buildSystemPrompt();
    const blockPrompt = aiContent.buildBlockPrompt(blockType, prompt);

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: blockPrompt,
      maxOutputTokens: MAX_AI_RESPONSE_TOKENS,
    });

    const attrs = aiContent.parseBlockResponse(text);
    if (!attrs) {
      res.status(422).json({ error: 'Failed to parse AI response into valid block data.' });
      return;
    }

    res.json({ attrs });
  } catch (err: unknown) {
    console.error('[AI] Block generation failed:', err);
    res.status(500).json({ error: 'AI generation failed. Please try again.' });
  }
});

const autoFillSchema = z.object({
  blockType: z.string().min(1).refine(
    (t) => SUPPORTED_BLOCK_TYPES.includes(t),
    { message: 'Unsupported block type' }
  ),
  currentAttrs: z.record(
    z.union([z.string().max(5000), z.number(), z.boolean(), z.null()])
  ).refine((obj) => Object.keys(obj).length <= 50, 'Too many attributes'),
});

aiGenerateRoutes.post('/autofill', autoFillRateLimit, async (req: AuthRequest, res: Response) => {
  const parsed = autoFillSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
    return;
  }

  const { blockType, currentAttrs } = parsed.data;
  const model = await getModelForUser(req.userId!);
  if (!model) {
    res.status(400).json({ error: 'AI not configured. Please set up your API key in AI settings.' });
    return;
  }

  try {
    const systemPrompt = aiContent.buildSystemPrompt();
    const autoFillPrompt = aiContent.buildAutoFillPrompt(blockType, currentAttrs);

    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: autoFillPrompt,
      maxOutputTokens: MAX_AI_RESPONSE_TOKENS,
    });

    const suggestions = aiContent.parseBlockResponse(text);
    if (!suggestions) {
      res.status(422).json({ error: 'Failed to parse AI suggestions.' });
      return;
    }

    res.json({ suggestions });
  } catch (err: unknown) {
    console.error('[AI] Auto-fill failed:', err);
    res.status(500).json({ error: 'AI auto-fill failed. Please try again.' });
  }
});

// --- Chat routes (project-scoped) ---
export const aiChatRoutes = Router({ mergeParams: true });
aiChatRoutes.use(requireAuth);

aiChatRoutes.get('/ai/chat', async (req: AuthRequest, res: Response) => {
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
});

const chatMessageSchema = z.object({
  message: z.string().min(1).max(10000),
});

aiChatRoutes.post('/ai/chat', chatRateLimit, async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  const parsed = chatMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation failed' });
    return;
  }

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

  let savedUserMsgId: string | null = null;

  try {
    // Get or create session, save user message
    const session = await aiChat.getOrCreateSession(projectId, req.userId!);
    const savedMsg = await aiChat.addMessage(session.id, 'user', parsed.data.message);
    savedUserMsgId = savedMsg.id;

    // Build message history — limited to recent messages for context window safety
    const history = await aiChat.getRecentMessages(session.id, MAX_CHAT_CONTEXT_MESSAGES);
    const messages = history.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    const systemPrompt = aiContent.buildSystemPrompt(project.title);

    // Stream the response
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      maxOutputTokens: MAX_AI_RESPONSE_TOKENS,
    });

    // Collect the full response for persistence
    let fullResponse = '';
    const stream = result.textStream;

    // Set up streaming headers
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    for await (const chunk of stream) {
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
        await prisma.aiChatMessage.delete({ where: { id: savedUserMsgId } }).catch(() => {});
      }
      res.status(500).json({ error: 'Chat failed. Please try again.' });
    } else {
      // Mid-stream failure: signal to client and don't persist partial response
      res.write('\n\n[Response interrupted. Please try again.]');
      res.end();
    }
  }
});

aiChatRoutes.delete('/ai/chat', async (req: AuthRequest, res: Response) => {
  const projectId = req.params.projectId as string;
  try {
    await aiChat.clearSessionByProject(projectId, req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error('[AI] Failed to clear chat:', err);
    res.status(500).json({ error: 'Failed to clear chat history.' });
  }
});

// --- Shared helper ---
async function getModelForUser(userId: string) {
  const settings = await aiSettings.getAiSettings(userId);
  if (!settings?.provider || !settings.hasApiKey) return null;

  const apiKey = await aiSettings.getDecryptedApiKey(userId);
  if (!apiKey) return null;

  return createModel(settings.provider, apiKey, settings.model ?? undefined);
}
