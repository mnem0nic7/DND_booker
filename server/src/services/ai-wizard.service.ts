import { prisma } from '../config/database.js';
import { generateText } from 'ai';
import type { WizardPhase, WizardParameters, WizardOutline, WizardOutlineSection, WizardGeneratedSection, WizardQuestion } from '@dnd-booker/shared';
import { getSupportedBlockTypes } from './ai-content.service.js';

// ── Session CRUD ────────────────────────────────────────────────

export async function getSession(projectId: string, userId: string) {
  return prisma.aiWizardSession.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
}

export async function getOrCreateSession(projectId: string, userId: string) {
  return prisma.aiWizardSession.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId },
    update: {},
  });
}

export async function updateSession(
  id: string,
  data: {
    phase?: WizardPhase;
    parameters?: WizardParameters | null;
    outline?: WizardOutline | null;
    sections?: WizardGeneratedSection[];
    progress?: number;
    errorMsg?: string | null;
  },
) {
  return prisma.aiWizardSession.update({ where: { id }, data: data as Record<string, unknown> });
}

export async function deleteSession(projectId: string, userId: string) {
  const existing = await prisma.aiWizardSession.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  if (existing) {
    await prisma.aiWizardSession.delete({ where: { id: existing.id } });
  }
}

// ── Prompt Builders ─────────────────────────────────────────────

const SUPPORTED_BLOCKS = getSupportedBlockTypes();

export function buildQuestionnairePrompt(projectType: string): string {
  return `You are a creative D&D 5e adventure designer helping a DM plan a ${projectType}.

Generate 4-5 smart clarifying questions to understand what the user wants. Each question should have 3-4 suggested options the user can pick from, but they can also give a custom answer.

Questions should cover:
- Theme/setting (e.g., dungeon crawl, political intrigue, wilderness exploration)
- Party level range
- Tone (dark & gritty, heroic, comedic, horror)
- Length/scope
- Any unique hooks or constraints

Return ONLY a JSON array of question objects. No explanation, no markdown fences.
Schema: [{"id": "q1", "question": "string", "options": ["opt1", "opt2", "opt3"]}]`;
}

export function buildOutlinePrompt(params: WizardParameters): string {
  const answersText = Object.entries(params.answers)
    .map(([qId, answer]) => `${qId}: ${answer}`)
    .join('\n');

  return `You are a creative D&D 5e adventure designer. Based on the following answers from a DM, create a detailed adventure outline.

Project type: ${params.projectType}

DM's answers:
${answersText}

Create a structured adventure outline with 4-8 sections. Each section should be a logical part of the adventure (e.g., "Introduction & Hook", "The Haunted Mine", "The Final Confrontation").

Available D&D block types you can suggest for each section: ${SUPPORTED_BLOCKS.join(', ')}, readAloudBox

Return ONLY a JSON object. No explanation, no markdown fences.
Schema:
{
  "adventureTitle": "string — evocative title for the adventure",
  "summary": "string — 2-3 sentence adventure summary",
  "sections": [
    {
      "id": "section-1",
      "title": "string — section title",
      "description": "string — 2-3 sentences describing what happens in this section",
      "blockHints": ["statBlock", "readAloudBox"],
      "sortOrder": 0
    }
  ]
}`;
}

export function buildSectionPrompt(
  outline: WizardOutline,
  section: WizardOutlineSection,
  previousSummaries: string[],
): string {
  const prevContext = previousSummaries.length > 0
    ? `\n\nPrevious sections summary (for narrative continuity):\n${previousSummaries.map((s, i) => `Section ${i + 1}: ${s}`).join('\n')}`
    : '';

  const blockHintsText = section.blockHints.length > 0
    ? `\n\nInclude these D&D content blocks in this section: ${section.blockHints.join(', ')}.
Use the :::blockType syntax to mark blocks:

:::readAloudBox
Descriptive read-aloud text the DM reads to players.
:::

:::statBlock
{"name":"Creature Name","size":"Medium","type":"humanoid",...}
:::

For statBlock, spellCard, magicItem, npcProfile, randomTable, encounterTable, and other structured blocks, put the complete JSON attrs object inside the fenced block.
For readAloudBox and sidebarCallout, put the prose content directly.`
    : '';

  return `You are a creative D&D 5e adventure writer. Write the content for one section of an adventure.

Adventure: "${outline.adventureTitle}"
Adventure summary: ${outline.summary}

Current section: "${section.title}"
Section description: ${section.description}
${prevContext}${blockHintsText}

Write this section as rich markdown content suitable for a D&D adventure module. Include:
- Descriptive prose and DM guidance
- Read-aloud text in :::readAloudBox blocks
- Any relevant stat blocks, items, or NPCs using :::blockType blocks
- Headings (## and ###) to organize subsections

Write immersive, detailed content. Be creative but follow D&D 5e rules.
Do NOT wrap the entire response in code fences. Output raw markdown with :::block markers directly.`;
}

// ── Markdown → TipTap Conversion ────────────────────────────────

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
}

/**
 * Convert markdown with :::blockType markers to TipTap JSON.
 * Handles: headings, paragraphs, bold, italic, lists, and fenced D&D blocks.
 */
export function markdownToTipTap(markdown: string): TipTapNode {
  const lines = markdown.split('\n');
  const content: TipTapNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced D&D block: :::blockType ... :::
    const blockMatch = line.match(/^:::(\w+)\s*$/);
    if (blockMatch) {
      const blockType = blockMatch[1];
      const blockLines: string[] = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ':::') {
        blockLines.push(lines[i]);
        i++;
      }
      i++; // skip closing :::

      const blockContent = blockLines.join('\n').trim();

      // For structured blocks (statBlock, spellCard, etc.), parse JSON attrs
      if (['readAloudBox', 'sidebarCallout'].includes(blockType)) {
        // Prose blocks — wrap content in a paragraph inside the block
        content.push({
          type: blockType,
          attrs: blockType === 'sidebarCallout'
            ? { title: 'Note', calloutType: 'info' }
            : undefined,
          content: parseInlineContent(blockContent),
        });
      } else {
        // Structured blocks — try to parse JSON attrs
        try {
          const attrs = JSON.parse(blockContent);
          content.push({ type: blockType, attrs });
        } catch {
          // If JSON parse fails, treat as a paragraph
          content.push(...parseInlineContent(blockContent));
        }
      }
      continue;
    }

    // ── Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      content.push({
        type: 'heading',
        attrs: { level },
        content: parseInlineMarks(headingMatch[2]),
      });
      i++;
      continue;
    }

    // ── Unordered list
    if (line.match(/^[-*]\s+/)) {
      const items: TipTapNode[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s+/)) {
        const itemText = lines[i].replace(/^[-*]\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarks(itemText) }],
        });
        i++;
      }
      content.push({ type: 'bulletList', content: items });
      continue;
    }

    // ── Ordered list
    if (line.match(/^\d+\.\s+/)) {
      const items: TipTapNode[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s+/)) {
        const itemText = lines[i].replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarks(itemText) }],
        });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // ── Horizontal rule
    if (line.match(/^---+\s*$/) || line.match(/^\*\*\*+\s*$/)) {
      content.push({ type: 'horizontalRule' });
      i++;
      continue;
    }

    // ── Empty line (skip)
    if (line.trim() === '') {
      i++;
      continue;
    }

    // ── Paragraph (default) — collect contiguous non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].match(/^:::/) &&
      !lines[i].match(/^[-*]\s+/) &&
      !lines[i].match(/^\d+\.\s+/) &&
      !lines[i].match(/^---+\s*$/) &&
      !lines[i].match(/^\*\*\*+\s*$/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      content.push({
        type: 'paragraph',
        content: parseInlineMarks(paraLines.join(' ')),
      });
    }
  }

  return { type: 'doc', content };
}

/** Parse a block of text into paragraphs */
function parseInlineContent(text: string): TipTapNode[] {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((p) => ({
    type: 'paragraph',
    content: parseInlineMarks(p.replace(/\n/g, ' ')),
  }));
}

/** Parse inline bold/italic marks in a line of text */
export function parseInlineMarks(text: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  // Regex matches: **bold**, *italic*, ***bold+italic***, or plain text
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // ***bold+italic***
      nodes.push({
        type: 'text',
        text: match[2],
        marks: [{ type: 'bold' }, { type: 'italic' }],
      });
    } else if (match[3]) {
      // **bold**
      nodes.push({
        type: 'text',
        text: match[3],
        marks: [{ type: 'bold' }],
      });
    } else if (match[4]) {
      // *italic*
      nodes.push({
        type: 'text',
        text: match[4],
        marks: [{ type: 'italic' }],
      });
    } else if (match[5]) {
      // plain text
      nodes.push({ type: 'text', text: match[5] });
    }
  }

  // Fallback: if regex produced nothing, return the raw text
  if (nodes.length === 0 && text.length > 0) {
    nodes.push({ type: 'text', text });
  }

  return nodes;
}

// ── Question Parsing ────────────────────────────────────────────

export function parseQuestionsResponse(rawText: string): WizardQuestion[] | null {
  // Try to extract JSON array from the response
  let jsonStr = rawText.trim();

  // Strip markdown fences if present
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Find the array boundaries
  const start = jsonStr.indexOf('[');
  const end = jsonStr.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) return null;

  jsonStr = jsonStr.slice(start, end + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return null;

    return parsed.filter(
      (q: unknown): q is WizardQuestion =>
        typeof q === 'object' && q !== null &&
        'id' in q && 'question' in q &&
        typeof (q as Record<string, unknown>).id === 'string' &&
        typeof (q as Record<string, unknown>).question === 'string',
    );
  } catch {
    return null;
  }
}

// ── Outline Parsing ─────────────────────────────────────────────

export function parseOutlineResponse(rawText: string): WizardOutline | null {
  let jsonStr = rawText.trim();

  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  const start = jsonStr.indexOf('{');
  const end = jsonStr.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;

  jsonStr = jsonStr.slice(start, end + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    if (
      typeof parsed !== 'object' || !parsed ||
      !parsed.adventureTitle || !parsed.sections || !Array.isArray(parsed.sections)
    ) {
      return null;
    }

    return {
      adventureTitle: String(parsed.adventureTitle),
      summary: String(parsed.summary || ''),
      sections: parsed.sections.map((s: Record<string, unknown>, idx: number) => ({
        id: String(s.id || `section-${idx + 1}`),
        title: String(s.title || `Section ${idx + 1}`),
        description: String(s.description || ''),
        blockHints: Array.isArray(s.blockHints) ? s.blockHints.map(String) : [],
        sortOrder: typeof s.sortOrder === 'number' ? s.sortOrder : idx,
      })),
    };
  } catch {
    return null;
  }
}

// ── Generate Questions ──────────────────────────────────────────

export async function generateQuestions(
  projectType: string,
  model: Parameters<typeof generateText>[0]['model'],
): Promise<WizardQuestion[]> {
  const prompt = buildQuestionnairePrompt(projectType);

  const { text } = await generateText({
    model,
    prompt,
    maxOutputTokens: 2048,
  });

  const questions = parseQuestionsResponse(text);
  if (!questions || questions.length === 0) {
    throw new Error('Failed to parse AI-generated questions');
  }

  return questions;
}

// ── Generate Outline ────────────────────────────────────────────

export async function generateOutline(
  params: WizardParameters,
  model: Parameters<typeof generateText>[0]['model'],
): Promise<WizardOutline> {
  const prompt = buildOutlinePrompt(params);

  const { text } = await generateText({
    model,
    prompt,
    maxOutputTokens: 4096,
  });

  const outline = parseOutlineResponse(text);
  if (!outline) {
    throw new Error('Failed to parse AI-generated outline');
  }

  return outline;
}

// ── Generate Single Section ─────────────────────────────────────

export async function generateSection(
  outline: WizardOutline,
  section: WizardOutlineSection,
  previousSummaries: string[],
  model: Parameters<typeof generateText>[0]['model'],
  abortSignal?: AbortSignal,
): Promise<{ content: TipTapNode; markdown: string }> {
  const prompt = buildSectionPrompt(outline, section, previousSummaries);

  const { text } = await generateText({
    model,
    prompt,
    maxOutputTokens: 8192,
    abortSignal,
  });

  const content = markdownToTipTap(text);
  return { content, markdown: text };
}

// ── Summarize Section (for context passing) ─────────────────────

export function summarizeSection(markdown: string): string {
  // Take first 300 chars of non-block content as a summary
  const lines = markdown.split('\n');
  const textLines = lines.filter(
    (l) => !l.startsWith(':::') && !l.startsWith('{') && l.trim().length > 0,
  );
  const summary = textLines.join(' ').slice(0, 300);
  return summary.length >= 300 ? summary + '...' : summary;
}

// ── Apply to Project ────────────────────────────────────────────

export async function applyToProject(
  projectId: string,
  sections: WizardGeneratedSection[],
  selectedSectionIds: string[],
) {
  // Get current max sortOrder
  const maxDoc = await prisma.document.findFirst({
    where: { projectId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });
  let nextSort = (maxDoc?.sortOrder ?? -1) + 1;

  const selectedSections = sections
    .filter((s) => selectedSectionIds.includes(s.sectionId) && s.status === 'completed')
    .sort((a, b) => {
      const aIdx = selectedSectionIds.indexOf(a.sectionId);
      const bIdx = selectedSectionIds.indexOf(b.sectionId);
      return aIdx - bIdx;
    });

  const createdDocs = [];

  for (const section of selectedSections) {
    const doc = await prisma.document.create({
      data: {
        projectId,
        title: section.title,
        sortOrder: nextSort++,
        content: section.content as object ?? {},
      },
    });
    createdDocs.push(doc);
  }

  return createdDocs;
}
