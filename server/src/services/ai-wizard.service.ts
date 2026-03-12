import { Prisma } from '@prisma/client';
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

/** Atomic delete+create — avoids race conditions with concurrent requests */
export async function resetAndCreateSession(projectId: string, userId: string) {
  return prisma.aiWizardSession.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId },
    update: {
      phase: 'questionnaire',
      parameters: Prisma.DbNull,
      outline: Prisma.DbNull,
      sections: [],
      progress: 0,
      errorMsg: null,
    },
  });
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

export function buildAutoOutlinePrompt(userPrompt: string): string {
  return `You are a creative D&D 5e adventure designer. A DM has asked you to create an adventure based on this request:

"${userPrompt}"

Create a detailed adventure outline with 4-8 sections. Each section should be a logical part of the adventure (e.g., "Introduction & Hook", "The Haunted Mine", "The Final Confrontation").

If the request is vague, use your creativity to fill in details — pick an interesting theme, appropriate level range, and compelling story hooks. Make it exciting and playable.

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

:::sidebarCallout title="DM Tips" calloutType="info"
Tips or notes for the DM. Can use title and calloutType attributes.
:::

:::statBlock
{"name":"Goblin Shaman","size":"Small","type":"humanoid","alignment":"neutral evil","ac":13,"acType":"natural armor","hp":21,"hitDice":"6d6","speed":"30 ft.","str":8,"dex":14,"con":10,"int":12,"wis":15,"cha":11,"skills":"Arcana +3, Stealth +4","senses":"darkvision 60 ft., passive Perception 12","languages":"Common, Goblin","cr":"1","xp":"200","traits":"[{\\"name\\":\\"Spellcasting\\",\\"description\\":\\"The shaman casts spells using Wisdom (DC 12, +4 to hit).\\"}]","actions":"[{\\"name\\":\\"Staff\\",\\"description\\":\\"Melee Weapon Attack: +1 to hit, 5 ft., 1d6-1 bludgeoning.\\"}]","reactions":"[]","legendaryActions":"[]"}
:::

IMPORTANT: For statBlock, spellCard, magicItem, npcProfile, randomTable, encounterTable, and other structured blocks, put a SINGLE LINE of valid JSON inside the fenced block.
Array fields (traits, actions, reactions, legendaryActions, features, entries) MUST be JSON-encoded STRINGS, not raw arrays. Use escaped quotes: "[{\\"name\\":\\"Bite\\",\\"description\\":\\"Attack...\\"}]"
For readAloudBox and sidebarCallout, put prose content directly (not JSON).`
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
    const rawLine = lines[i];
    const line = rawLine.trimStart();

    // ── Fenced D&D block: :::blockType ... ::: (with optional attrs like title="...")
    const blockMatch = line.match(/^:::(\w+)(.*)$/);
    if (blockMatch) {
      const rawBlockType = blockMatch[1];
      const blockType = normalizeWizardBlockType(rawBlockType);
      const inlineAttrs = blockMatch[2]?.trim() || '';

      if (isInlineProseBlock(rawBlockType, inlineAttrs)) {
        content.push(createInlineProseBlock(rawBlockType, inlineAttrs));
        i++;
        continue;
      }

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
        // Parse inline attributes (e.g., title="Custom Title" calloutType="warning")
        const parsedAttrs: Record<string, string> = {};
        const attrRegex = /(\w+)="([^"]*)"/g;
        let attrMatch: RegExpExecArray | null;
        while ((attrMatch = attrRegex.exec(inlineAttrs)) !== null) {
          parsedAttrs[attrMatch[1]] = attrMatch[2];
        }

        const attrs = blockType === 'sidebarCallout'
          ? { title: parsedAttrs.title || defaultSidebarTitleForBlock(rawBlockType), calloutType: parsedAttrs.calloutType || 'info' }
          : undefined;

        content.push({
          type: blockType,
          attrs,
          content: parseInlineContent(blockContent),
        });
      } else {
        // Structured blocks — try to parse JSON attrs
        try {
          const attrs = JSON.parse(blockContent);
          // Normalize array fields that TipTap expects as JSON-encoded strings
          // (AI sometimes outputs real arrays instead of stringified JSON arrays)
          const arrayFields = ['traits', 'actions', 'reactions', 'legendaryActions',
            'features', 'entries', 'keyEntries'];
          for (const field of arrayFields) {
            if (Array.isArray(attrs[field])) {
              attrs[field] = JSON.stringify(attrs[field]);
            }
          }
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
      while (i < lines.length && lines[i].trimStart().match(/^[-*]\s+/)) {
        const itemText = lines[i].trimStart().replace(/^[-*]\s+/, '');
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
      while (i < lines.length && lines[i].trimStart().match(/^\d+\.\s+/)) {
        const itemText = lines[i].trimStart().replace(/^\d+\.\s+/, '');
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: parseInlineMarks(itemText) }],
        });
        i++;
      }
      content.push({ type: 'orderedList', content: items });
      continue;
    }

    // ── Code fence (triple backtick)
    if (line.match(/^```/)) {
      const langMatch = line.match(/^```(\w+)?/);
      const language = langMatch?.[1] || null;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      content.push({
        type: 'codeBlock',
        attrs: language ? { language } : {},
        content: codeLines.length > 0
          ? [{ type: 'text', text: codeLines.join('\n') }]
          : undefined,
      });
      continue;
    }

    // ── Blockquote
    if (line.match(/^>\s?/)) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trimStart().match(/^>\s?/)) {
        quoteLines.push(lines[i].trimStart().replace(/^>\s?/, ''));
        i++;
      }
      content.push({
        type: 'blockquote',
        content: [{
          type: 'paragraph',
          content: parseInlineMarks(quoteLines.join(' ')),
        }],
      });
      continue;
    }

    // ── Markdown table (lines starting with |)
    if (line.match(/^\|.+\|/)) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].match(/^\|.+\|/)) {
        tableLines.push(lines[i]);
        i++;
      }
      // Parse table: first line = header, second line = separator (skip), rest = data rows
      if (tableLines.length >= 2) {
        const parseRow = (row: string): string[] =>
          row.split('|').slice(1, -1).map((cell) => cell.trim());

        const headerCells = parseRow(tableLines[0]);
        // Skip separator row (index 1)
        const dataRows = tableLines.slice(2).map(parseRow);

        const headerRow: TipTapNode = {
          type: 'tableRow',
          content: headerCells.map((cell) => ({
            type: 'tableHeader',
            content: [{ type: 'paragraph', content: parseInlineMarks(cell) }],
          })),
        };

        const bodyRows: TipTapNode[] = dataRows.map((cells) => ({
          type: 'tableRow',
          content: cells.map((cell) => ({
            type: 'tableCell',
            content: [{ type: 'paragraph', content: parseInlineMarks(cell) }],
          })),
        }));

        content.push({
          type: 'table',
          content: [headerRow, ...bodyRows],
        });
      }
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
      !lines[i].trimStart().match(/^#{1,6}\s+/) &&
      !lines[i].trimStart().match(/^:::/) &&
      !lines[i].trimStart().match(/^[-*]\s+/) &&
      !lines[i].trimStart().match(/^\d+\.\s+/) &&
      !lines[i].trimStart().match(/^---+\s*$/) &&
      !lines[i].trimStart().match(/^\*\*\*+\s*$/) &&
      !lines[i].trimStart().match(/^```/) &&
      !lines[i].trimStart().match(/^>\s?/) &&
      !lines[i].trimStart().match(/^\|.+\|/)
    ) {
      paraLines.push(lines[i].trim());
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

function normalizeWizardBlockType(blockType: string): string {
  switch (blockType) {
    case 'readAloud':
      return 'readAloudBox';
    case 'dmTips':
      return 'sidebarCallout';
    default:
      return blockType;
  }
}

function defaultSidebarTitleForBlock(rawBlockType: string): string {
  return rawBlockType === 'dmTips' ? 'DM Tips' : 'Note';
}

function isInlineProseBlock(rawBlockType: string, inlinePayload: string): boolean {
  if (!inlinePayload) return false;
  if (rawBlockType === 'readAloud' || rawBlockType === 'readAloudBox') return true;
  if (rawBlockType === 'dmTips') return true;
  if (rawBlockType === 'sidebarCallout') {
    return !/^\w+="[^"]*"/.test(inlinePayload);
  }
  return false;
}

function createInlineProseBlock(rawBlockType: string, inlinePayload: string): TipTapNode {
  const blockType = normalizeWizardBlockType(rawBlockType);
  const content = parseInlineContent(inlinePayload);

  if (blockType === 'sidebarCallout') {
    return {
      type: 'sidebarCallout',
      attrs: {
        title: defaultSidebarTitleForBlock(rawBlockType),
        calloutType: 'info',
      },
      content,
    };
  }

  return {
    type: 'readAloudBox',
    content,
  };
}

/** Parse a block of text into paragraphs */
function parseInlineContent(text: string): TipTapNode[] {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((p) => ({
    type: 'paragraph',
    content: parseInlineMarks(p.replace(/\n/g, ' ')),
  }));
}

/** Parse inline bold/italic/code/link marks in a line of text */
export function parseInlineMarks(text: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  // Regex: [link](url), `code`, ***bold+italic***, **bold**, *italic*, plain text, or single special char
  // The final (.) catches unmatched *, [, ` as literal text to prevent text loss
  const regex = /(\[([^\]]+)\]\(([^)]+)\)|`(.+?)`|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^`*\[]+)|(.))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match[2] && match[3]) {
      // [link text](url)
      nodes.push({
        type: 'text',
        text: match[2],
        marks: [{ type: 'link', attrs: { href: match[3], target: '_blank' } }],
      });
    } else if (match[4]) {
      // `inline code`
      nodes.push({
        type: 'text',
        text: match[4],
        marks: [{ type: 'code' }],
      });
    } else if (match[5]) {
      // ***bold+italic***
      nodes.push({
        type: 'text',
        text: match[5],
        marks: [{ type: 'bold' }, { type: 'italic' }],
      });
    } else if (match[6]) {
      // **bold**
      nodes.push({
        type: 'text',
        text: match[6],
        marks: [{ type: 'bold' }],
      });
    } else if (match[7]) {
      // *italic*
      nodes.push({
        type: 'text',
        text: match[7],
        marks: [{ type: 'italic' }],
      });
    } else if (match[8]) {
      // plain text
      nodes.push({ type: 'text', text: match[8] });
    } else if (match[9]) {
      // single unmatched special character (*, [, `) — treat as literal
      const prev = nodes[nodes.length - 1];
      if (prev && !prev.marks) {
        prev.text += match[9]; // merge with previous plain text node
      } else {
        nodes.push({ type: 'text', text: match[9] });
      }
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

// ── Generate Outline from Prompt (autonomous) ───────────────────

export async function generateOutlineFromPrompt(
  userPrompt: string,
  model: Parameters<typeof generateText>[0]['model'],
  abortSignal?: AbortSignal,
): Promise<WizardOutline> {
  const prompt = buildAutoOutlinePrompt(userPrompt);

  const { text } = await generateText({
    model,
    prompt,
    maxOutputTokens: 4096,
    abortSignal,
  });

  const outline = parseOutlineResponse(text);
  if (!outline) {
    throw new Error('Failed to parse AI-generated outline');
  }

  return outline;
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
  maxOutputTokens = 8192,
): Promise<{ content: TipTapNode; markdown: string }> {
  const prompt = buildSectionPrompt(outline, section, previousSummaries);

  const { text } = await generateText({
    model,
    prompt,
    maxOutputTokens,
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
  const selectedSections = sections
    .filter((s) => selectedSectionIds.includes(s.sectionId) && s.status === 'completed')
    .sort((a, b) => {
      const aIdx = selectedSectionIds.indexOf(a.sectionId);
      const bIdx = selectedSectionIds.indexOf(b.sectionId);
      return aIdx - bIdx;
    });

  // Build new content nodes from selected sections, with pageBreaks between them
  const newNodes: object[] = [];
  for (let i = 0; i < selectedSections.length; i++) {
    if (i > 0) {
      newNodes.push({ type: 'pageBreak' });
    }
    const sectionContent = selectedSections[i].content as { content?: object[] } | null;
    if (sectionContent?.content) {
      newNodes.push(...sectionContent.content);
    }
  }

  if (newNodes.length === 0) return null;

  // Append to existing project content
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { content: true },
  });

  const existing = project?.content as { type?: string; content?: object[] } | null;
  const existingNodes = existing?.content ?? [];

  // Add a pageBreak before the new content if there's existing content
  const mergedNodes = existingNodes.length > 0
    ? [...existingNodes, { type: 'pageBreak' }, ...newNodes]
    : newNodes;

  return prisma.project.update({
    where: { id: projectId },
    data: {
      content: { type: 'doc', content: mergedNodes },
    },
  });
}
