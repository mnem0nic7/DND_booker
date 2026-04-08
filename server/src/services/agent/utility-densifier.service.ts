import type { CritiqueBacklogItem, DocumentContent } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { generateTextWithTimeout } from '../generation/model-timeouts.js';
import { parseJsonResponse } from '../generation/parse-json.js';
import { buildResolvedPublicationDocumentWriteData } from '../document-publication.service.js';
import { rebuildProjectContentCache } from '../project-document-content.service.js';
import { resolveAgentModelForUser } from './model-resolution.service.js';

interface UtilityPacketContent {
  sceneSetupParagraphs: string[];
  summaryTitle: string;
  summaryParagraphs: string[];
  clueTitle: string;
  clueBullets: string[];
  signalsAndStakes: string[];
  escalationSteps: string[];
  consequenceTitle: string;
  consequenceBullets: string[];
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

function readAloudBox(paragraphs: string[]): DocumentContent {
  return {
    type: 'readAloudBox',
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
    sceneSetupParagraphs: [
      `Open ${documentTitle} by naming the strongest sensory detail in the scene, the first sign that trouble is active, and the easiest clue or reaction the party can seize immediately.`,
      'If the table hesitates, push the scene forward with a visible cost: a worsening omen, a nervous witness, a hostile move, or a clue that becomes harder to claim.',
    ],
    summaryTitle: 'DM Running Summary',
    summaryParagraphs: [
      `Run ${documentTitle} as a pressure scene with one clear clue, one immediate problem, and one visible consequence if the party hesitates or chooses the wrong lead first.`,
      'Keep the chapter moving in short beats: surface a lead, force a choice, pay off the result quickly, and show how the world reacts so the DM never has to invent the next useful move from nothing.',
    ],
    clueTitle: 'Clues, Leverage, and Payoffs',
    clueBullets: [
      'Name the first clue the party can notice without a perfect roll and what extra detail a stronger success reveals.',
      'Tie at least one clue to a person, object, omen, or environmental feature the DM can point to at the table.',
      'Give the scene one leverage point or bargaining chip the party can use if they negotiate instead of forcing the issue.',
      'Show the immediate payoff for decisive action: cleaner information, tactical advantage, a grateful NPC, or safer progress.',
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
    consequenceTitle: 'Payoffs and Fallout',
    consequenceBullets: [
      'Show what the party gains right away if they press the strongest lead first: cleaner evidence, a grateful ally, safer access, or a tactical edge.',
      'Name one setback that lands immediately on failure or delay so the DM can escalate without stalling.',
      'Tie at least one outcome to a later chapter beat so success or failure changes future play instead of vanishing.',
      'End with a concrete next move the party can pursue as soon as this scene resolves.',
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
    readAloudBox(packet.sceneSetupParagraphs),
    sidebarCallout(packet.summaryTitle, 'info', packet.summaryParagraphs),
    sidebarCallout(packet.clueTitle, 'lore', packet.clueBullets),
    bulletList(packet.signalsAndStakes),
    orderedList(packet.escalationSteps),
    sidebarCallout(packet.consequenceTitle, 'info', packet.consequenceBullets),
    sidebarCallout(packet.pressureTitle, 'warning', packet.pressureParagraphs),
  ];
}

async function generateUtilityPacketWithModel(input: {
  userId: string;
  documentTitle: string;
  documentSample: string;
}) {
  const { model, maxOutputTokens } = await resolveAgentModelForUser(input.userId, {
    agentKey: 'agent.utility_densifier',
  });

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
    '{"sceneSetupParagraphs":["...","..."],"summaryTitle":"DM Running Summary","summaryParagraphs":["...","..."],"clueTitle":"Clues, Leverage, and Payoffs","clueBullets":["...","...","...","..."],"signalsAndStakes":["...","...","...","..."],"escalationSteps":["...","...","..."],"consequenceTitle":"Payoffs and Fallout","consequenceBullets":["...","...","...","..."],"pressureTitle":"Pressure and Consequences","pressureParagraphs":["...","..."]}',
    '',
    'Rules:',
    '- sceneSetupParagraphs: exactly 2 boxed read-aloud style paragraphs for the DM to paraphrase or read',
    '- summaryParagraphs: exactly 2 concise DM-facing paragraphs',
    '- clueBullets: exactly 4 concrete bullets covering clues, leverage, or payoffs',
    '- signalsAndStakes: 4 to 5 bullets',
    '- escalationSteps: exactly 3 numbered steps',
    '- consequenceBullets: exactly 4 concrete bullets covering payoff, fallout, or next-step consequences',
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
    sceneSetupParagraphs: sanitizeLines(parsed.sceneSetupParagraphs, 2).slice(0, 2),
    summaryTitle: typeof parsed.summaryTitle === 'string' && parsed.summaryTitle.trim()
      ? parsed.summaryTitle.trim()
      : 'DM Running Summary',
    summaryParagraphs: sanitizeLines(parsed.summaryParagraphs, 2).slice(0, 2),
    clueTitle: typeof parsed.clueTitle === 'string' && parsed.clueTitle.trim()
      ? parsed.clueTitle.trim()
      : 'Clues, Leverage, and Payoffs',
    clueBullets: sanitizeLines(parsed.clueBullets, 4).slice(0, 4),
    signalsAndStakes: sanitizeLines(parsed.signalsAndStakes, 4).slice(0, 5),
    escalationSteps: sanitizeLines(parsed.escalationSteps, 3).slice(0, 3),
    consequenceTitle: typeof parsed.consequenceTitle === 'string' && parsed.consequenceTitle.trim()
      ? parsed.consequenceTitle.trim()
      : 'Payoffs and Fallout',
    consequenceBullets: sanitizeLines(parsed.consequenceBullets, 4).slice(0, 4),
    pressureTitle: typeof parsed.pressureTitle === 'string' && parsed.pressureTitle.trim()
      ? parsed.pressureTitle.trim()
      : 'Pressure and Consequences',
    pressureParagraphs: sanitizeLines(parsed.pressureParagraphs, 2).slice(0, 2),
  };

  if (
    packet.sceneSetupParagraphs.length < 2
    || packet.clueBullets.length < 4
    || packet.summaryParagraphs.length < 2
    || packet.signalsAndStakes.length < 4
    || packet.escalationSteps.length < 3
    || packet.consequenceBullets.length < 4
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

    const writeData = buildResolvedPublicationDocumentWriteData({
      content: {
        ...baseContent,
        content: topLevel,
      },
      layoutPlan: document.layoutPlan,
      kind: document.kind,
      title: document.title,
      versions: {
        canonicalVersion: document.canonicalVersion,
        editorProjectionVersion: document.editorProjectionVersion,
        typstVersion: document.typstVersion,
      },
      bumpVersions: true,
    });

    await prisma.projectDocument.update({
      where: { id: document.id },
      data: {
        content: writeData.content,
        layoutPlan: writeData.layoutPlan,
        canonicalDocJson: writeData.canonicalDocJson,
        editorProjectionJson: writeData.editorProjectionJson,
        typstSource: writeData.typstSource,
        canonicalVersion: writeData.canonicalVersion,
        editorProjectionVersion: writeData.editorProjectionVersion,
        typstVersion: writeData.typstVersion,
        status: 'edited',
      },
    });
    documentsUpdated += 1;
    insertedBlockCount += packetBlocks.length;
    updatedTitles.push(document.title);
  }

  if (documentsUpdated > 0) {
    await rebuildProjectContentCache(input.projectId);
  }

  return {
    documentsUpdated,
    insertedBlockCount,
    updatedTitles,
  };
}
