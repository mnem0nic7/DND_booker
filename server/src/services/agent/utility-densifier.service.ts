import type { CritiqueBacklogItem, DocumentContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { generateTextWithTimeout } from '../generation/model-timeouts.js';
import { parseJsonResponse } from '../generation/parse-json.js';
import { resolveDocumentLayout } from '../layout-plan.service.js';
import { resolveAgentModelForUser } from './model-resolution.service.js';

interface UtilityPacketContent {
  summaryTitle: string;
  summaryParagraphs: string[];
  signalsAndStakes: string[];
  escalationSteps: string[];
  pressureTitle: string;
  pressureParagraphs: string[];
}

function cloneNode<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function textNode(text: string): DocumentContent {
  return {
    type: 'text',
    text,
  };
}

function paragraph(text: string): DocumentContent {
  return {
    type: 'paragraph',
    content: [textNode(text)],
  };
}

function sidebarCallout(
  title: string,
  calloutType: 'info' | 'warning' | 'lore',
  paragraphs: string[],
): DocumentContent {
  return {
    type: 'sidebarCallout',
    attrs: {
      title,
      calloutType,
    },
    content: paragraphs
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => paragraph(entry)),
  };
}

function bulletList(items: string[]): DocumentContent {
  return {
    type: 'bulletList',
    content: items
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => ({
        type: 'listItem',
        content: [paragraph(item)],
      })),
  };
}

function orderedList(items: string[]): DocumentContent {
  return {
    type: 'orderedList',
    attrs: { start: 1 },
    content: items
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => ({
        type: 'listItem',
        content: [paragraph(item)],
      })),
  };
}

function readNodeText(node: DocumentContent | null | undefined): string {
  if (!node) return '';
  if (typeof node.text === 'string') return node.text;
  return (node.content ?? []).map((child) => readNodeText(child)).join(' ');
}

function summarizeText(text: string, maxLength = 1400): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength).trim()}...` : normalized;
}

function ensureDocContent(content: DocumentContent | null): DocumentContent {
  if (content?.type === 'doc') return cloneNode(content);
  return {
    type: 'doc',
    content: content ? [cloneNode(content)] : [],
  };
}

function hasExistingUtilityPacket(content: DocumentContent): boolean {
  const topLevel = content.content ?? [];
  return topLevel.some((node) => node.type === 'sidebarCallout' && (
    String(node.attrs?.title ?? '').trim() === 'DM Running Summary'
    || String(node.attrs?.title ?? '').trim() === 'Pressure and Consequences'
  ));
}

function determineInsertionIndex(nodes: DocumentContent[]): number {
  const openerIndex = nodes.findIndex((node) => {
    if (node.type === 'chapterHeader') return true;
    if (node.type !== 'heading') return false;
    const level = Number(node.attrs?.level ?? 0);
    return Number.isFinite(level) && level > 0 && level <= 2;
  });

  if (openerIndex >= 0) return openerIndex + 1;
  return Math.min(nodes.length, 2);
}

function sanitizeLines(value: unknown, minimum = 0): string[] {
  if (!Array.isArray(value)) return [];
  const items = value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter(Boolean);
  return items.length >= minimum ? items : [];
}

export function buildFallbackUtilityPacket(documentTitle: string): UtilityPacketContent {
  return {
    summaryTitle: 'DM Running Summary',
    summaryParagraphs: [
      `Run ${documentTitle} as a pressure scene with one clear clue, one immediate problem, and one visible consequence if the party hesitates.`,
      'Keep the chapter moving in short beats: surface a lead, force a choice, and let the world react quickly enough that the table never has to hunt for the next useful move.',
    ],
    signalsAndStakes: [
      'State what the party notices first and who or what pushes on them immediately.',
      'Tie every clue to a cost, threat, ally, or bargaining angle the players can act on right away.',
      'Escalate quickly when the table stalls by adding a fresh omen, hostile move, deadline, or NPC demand.',
      'End the scene with a concrete lead, reward, or complication that points directly to the next playable beat.',
    ],
    escalationSteps: [
      'If the party hesitates, reveal a stronger sign of danger or a new demand within a few minutes of table time.',
      'If attention splits, let one lead advance while another opportunity closes or becomes riskier.',
      'On failure or delay, move the opposition forward openly and show the consequence instead of stalling progress.',
    ],
    pressureTitle: 'Pressure and Consequences',
    pressureParagraphs: [
      'Fail forward instead of dead-ending the scene. A missed check should reveal partial truth, increase danger, or spend a resource while still moving play onward.',
      'Reward decisive action with cleaner leads, tactical edges, or helpful NPC reactions the DM can immediately pay off in the next beat.',
    ],
  };
}

function buildPacketBlocks(packet: UtilityPacketContent): DocumentContent[] {
  return [
    sidebarCallout(packet.summaryTitle, 'info', packet.summaryParagraphs),
    bulletList(packet.signalsAndStakes),
    orderedList(packet.escalationSteps),
    sidebarCallout(packet.pressureTitle, 'warning', packet.pressureParagraphs),
  ];
}

async function generateUtilityPacketWithModel(input: {
  userId: string;
  documentTitle: string;
  documentSample: string;
}) {
  const { model, maxOutputTokens } = await resolveAgentModelForUser(input.userId);

  const system = [
    'You improve D&D adventure chapters for Dungeon Masters.',
    'Return JSON only.',
    'Create a compact DM-running packet for a prose-heavy scene.',
    'Be specific, table-usable, and concise.',
    'Do not invent new chapter structure or change the story premise.',
  ].join(' ');

  const prompt = [
    `Document title: ${input.documentTitle}`,
    'Document sample:',
    input.documentSample || '(no sample available)',
    '',
    'Return JSON with this exact shape:',
    '{"summaryTitle":"DM Running Summary","summaryParagraphs":["...","..."],"signalsAndStakes":["...","...","...","..."],"escalationSteps":["...","...","..."],"pressureTitle":"Pressure and Consequences","pressureParagraphs":["...","..."]}',
    '',
    'Rules:',
    '- summaryParagraphs: exactly 2 concise DM-facing paragraphs',
    '- signalsAndStakes: 4 to 5 bullets',
    '- escalationSteps: exactly 3 numbered steps',
    '- pressureParagraphs: exactly 2 concise DM-facing paragraphs',
    '- Keep each line table-usable and concrete',
  ].join('\n');

  const { text } = await generateTextWithTimeout('Agent utility densification', {
    model,
    system,
    prompt,
    maxOutputTokens: Math.min(maxOutputTokens, 2048),
  });

  const parsed = parseJsonResponse(text) as Record<string, unknown>;
  const packet: UtilityPacketContent = {
    summaryTitle: typeof parsed.summaryTitle === 'string' && parsed.summaryTitle.trim()
      ? parsed.summaryTitle.trim()
      : 'DM Running Summary',
    summaryParagraphs: sanitizeLines(parsed.summaryParagraphs, 2).slice(0, 2),
    signalsAndStakes: sanitizeLines(parsed.signalsAndStakes, 4).slice(0, 5),
    escalationSteps: sanitizeLines(parsed.escalationSteps, 3).slice(0, 3),
    pressureTitle: typeof parsed.pressureTitle === 'string' && parsed.pressureTitle.trim()
      ? parsed.pressureTitle.trim()
      : 'Pressure and Consequences',
    pressureParagraphs: sanitizeLines(parsed.pressureParagraphs, 2).slice(0, 2),
  };

  if (
    packet.summaryParagraphs.length < 2
    || packet.signalsAndStakes.length < 4
    || packet.escalationSteps.length < 3
    || packet.pressureParagraphs.length < 2
  ) {
    return null;
  }

  return packet;
}

export async function densifySectionUtilityFromBacklog(input: {
  projectId: string;
  userId: string;
  backlog: CritiqueBacklogItem[];
  limit?: number;
}) {
  const targets = input.backlog
    .filter((item) => item.code === 'EXPORT_LOW_UTILITY_DENSITY')
    .slice(0, input.limit ?? 1);

  if (targets.length === 0) {
    return {
      documentsUpdated: 0,
      insertedBlockCount: 0,
      updatedTitles: [] as string[],
    };
  }

  const titleFilters = Array.from(new Set(targets.map((item) => item.targetTitle).filter((value): value is string => Boolean(value))));
  const documents = await prisma.projectDocument.findMany({
    where: {
      projectId: input.projectId,
      ...(titleFilters.length > 0 ? { title: { in: titleFilters } } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  });

  let documentsUpdated = 0;
  let insertedBlockCount = 0;
  const updatedTitles: string[] = [];

  for (const document of documents) {
    const baseContent = ensureDocContent(document.content as DocumentContent | null);
    if (hasExistingUtilityPacket(baseContent)) continue;

    const topLevel = [...(baseContent.content ?? [])];
    const documentSample = summarizeText(readNodeText(baseContent));

    let packet = buildFallbackUtilityPacket(document.title);
    try {
      const generated = await generateUtilityPacketWithModel({
        userId: input.userId,
        documentTitle: document.title,
        documentSample,
      });
      if (generated) packet = generated;
    } catch {
      // Fall back to the deterministic DM-running packet.
    }

    const packetBlocks = buildPacketBlocks(packet);
    if (packetBlocks.length === 0) continue;

    const insertionIndex = determineInsertionIndex(topLevel);
    topLevel.splice(insertionIndex, 0, ...packetBlocks);

    const resolved = resolveDocumentLayout({
      content: {
        ...baseContent,
        content: topLevel,
      },
      layoutPlan: document.layoutPlan,
      kind: document.kind,
      title: document.title,
    });

    await prisma.projectDocument.update({
      where: { id: document.id },
      data: {
        content: resolved.content as any,
        layoutPlan: resolved.layoutPlan as any,
        status: 'edited',
      },
    });
    documentsUpdated += 1;
    insertedBlockCount += packetBlocks.length;
    updatedTitles.push(document.title);
  }

  return {
    documentsUpdated,
    insertedBlockCount,
    updatedTitles,
  };
}
