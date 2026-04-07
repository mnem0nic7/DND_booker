import type { CritiqueBacklogItem, DocumentContent } from '@dnd-booker/shared';
import { assessStatBlockAttrs, normalizeStatBlockAttrs } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { buildBlockPrompt, parseBlockResponse } from '../ai-content.service.js';
import { generateTextWithTimeout } from '../generation/model-timeouts.js';
import { resolveDocumentLayout } from '../layout-plan.service.js';
import { resolveAgentModelForUser } from './model-resolution.service.js';

type StatBlockAttrs = Record<string, unknown>;

function cloneNode<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value === null || value === undefined) return '';
  return String(value).trim();
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

function countSevereFlags(attrs: StatBlockAttrs): number {
  const assessment = assessStatBlockAttrs(attrs);
  return assessment.flags.length + (assessment.isPlaceholder ? 10 : 0);
}

function looksGhostly(attrs: StatBlockAttrs): boolean {
  const name = normalizeString(attrs.name).toLowerCase();
  const type = normalizeString(attrs.type).toLowerCase();
  return /\b(phantom|apparition|specter|spectre|ghost|wraith|shadow|spirit)\b/.test(name)
    || /\bundead\b/.test(type);
}

export function repairStatBlockAttrsDeterministically(attrs: StatBlockAttrs): StatBlockAttrs {
  const normalized = normalizeStatBlockAttrs(attrs);
  const next = { ...normalized };
  const assessment = assessStatBlockAttrs(next);

  if (assessment.flags.includes('suspicious_speed')) {
    const speed = normalizeString(next.speed);
    if (/^0\s*ft\.?\s*[,;]\s*(fly|hover|swim|climb|burrow)/i.test(speed)) {
      next.speed = speed.replace(/^0\s*ft\.?\s*[,;]\s*/i, '');
    } else if ((speed === '0 ft.' || speed === '0 ft') && looksGhostly(next)) {
      next.speed = 'fly 40 ft. (hover)';
    }
  }

  if (assessment.flags.includes('default_ability_scores') && looksGhostly(next)) {
    next.str = 6;
    next.dex = 14;
    next.con = 13;
    next.int = 6;
    next.wis = 12;
    next.cha = 12;
  }

  if (assessment.flags.includes('invalid_ac') && looksGhostly(next) && normalizeString(next.name)) {
    next.ac = 12;
    next.acType = normalizeString(next.acType) || 'natural armor';
  }

  if (assessment.flags.includes('invalid_hp') && looksGhostly(next) && normalizeString(next.name)) {
    next.hp = 22;
    next.hitDice = normalizeString(next.hitDice) || '5d8';
  }

  return normalizeStatBlockAttrs(next);
}

function isImprovement(previous: StatBlockAttrs, next: StatBlockAttrs): boolean {
  const previousPenalty = countSevereFlags(previous);
  const nextPenalty = countSevereFlags(next);
  if (nextPenalty >= previousPenalty) return false;

  const nextAssessment = assessStatBlockAttrs(next);
  return !nextAssessment.isPlaceholder || assessStatBlockAttrs(previous).isPlaceholder;
}

async function repairStatBlockWithModel(input: {
  userId: string;
  documentTitle: string;
  documentSample: string;
  currentAttrs: StatBlockAttrs;
}) {
  const { model, maxOutputTokens } = await resolveAgentModelForUser(input.userId, {
    agentKey: 'agent.stat_block_repair',
  });
  const assessment = assessStatBlockAttrs(input.currentAttrs);
  const prompt = buildBlockPrompt(
    'statBlock',
    [
      `Repair the following existing stat block for the chapter "${input.documentTitle}".`,
      'Keep the creature concept, signature abilities, and overall role intact when they are already usable.',
      'Fix placeholder or suspicious combat data so the stat block is safe for the DM to run immediately.',
      `Current problems: ${assessment.flags.join(', ') || 'none detected'}.`,
      '',
      'Current stat block:',
      JSON.stringify(normalizeStatBlockAttrs(input.currentAttrs), null, 2),
      '',
      'Nearby document context:',
      input.documentSample || '(no additional context available)',
    ].join('\n'),
  );

  const { text } = await generateTextWithTimeout('Agent stat-block repair', {
    model,
    prompt,
    maxOutputTokens: Math.min(maxOutputTokens, 4096),
  });

  const parsed = parseBlockResponse(text, 'statBlock');
  if (!parsed) return null;
  return normalizeStatBlockAttrs(parsed);
}

async function transformStatBlocks(
  node: DocumentContent,
  transform: (attrs: StatBlockAttrs) => Promise<StatBlockAttrs | null>,
): Promise<{ node: DocumentContent; updatedCount: number }> {
  let updatedCount = 0;
  const nextNode = cloneNode(node);

  if (nextNode.type === 'statBlock') {
    const repaired = await transform((nextNode.attrs ?? {}) as StatBlockAttrs);
    if (repaired) {
      nextNode.attrs = {
        ...(nextNode.attrs ?? {}),
        ...repaired,
      };
      updatedCount += 1;
    }
  }

  if (Array.isArray(nextNode.content) && nextNode.content.length > 0) {
    const children: DocumentContent[] = [];
    for (const child of nextNode.content) {
      const transformed = await transformStatBlocks(child, transform);
      children.push(transformed.node);
      updatedCount += transformed.updatedCount;
    }
    nextNode.content = children;
  }

  return {
    node: nextNode,
    updatedCount,
  };
}

export async function repairStatBlocksFromBacklog(input: {
  projectId: string;
  userId: string;
  backlog: CritiqueBacklogItem[];
  limit?: number;
}) {
  const targets = input.backlog
    .filter((item) => item.code === 'EXPORT_PLACEHOLDER_STAT_BLOCK' || item.code === 'EXPORT_SUSPICIOUS_STAT_BLOCK')
    .slice(0, input.limit ?? 1);

  if (targets.length === 0) {
    return {
      documentsUpdated: 0,
      statBlocksRepaired: 0,
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
  let statBlocksRepaired = 0;
  const updatedTitles: string[] = [];

  for (const document of documents) {
    const baseContent = document.content as DocumentContent | null;
    if (!baseContent) continue;

    const documentSample = summarizeText(readNodeText(baseContent));
    const transformed = await transformStatBlocks(
      baseContent,
      async (attrs) => {
        const assessment = assessStatBlockAttrs(attrs);
        if (!assessment.isPlaceholder && !assessment.isSuspicious) return null;

        let bestCandidate = repairStatBlockAttrsDeterministically(attrs);
        if (!isImprovement(attrs, bestCandidate)) {
          bestCandidate = normalizeStatBlockAttrs(attrs);
        }

        try {
          const modelCandidate = await repairStatBlockWithModel({
            userId: input.userId,
            documentTitle: document.title,
            documentSample,
            currentAttrs: attrs,
          });
          if (modelCandidate && isImprovement(attrs, modelCandidate) && countSevereFlags(modelCandidate) <= countSevereFlags(bestCandidate)) {
            bestCandidate = modelCandidate;
          }
        } catch {
          // Fall back to deterministic repair.
        }

        return isImprovement(attrs, bestCandidate) ? bestCandidate : null;
      },
    );

    if (transformed.updatedCount <= 0) continue;

    const resolved = resolveDocumentLayout({
      content: transformed.node,
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
    statBlocksRepaired += transformed.updatedCount;
    updatedTitles.push(document.title);
  }

  return {
    documentsUpdated,
    statBlocksRepaired,
    updatedTitles,
  };
}
