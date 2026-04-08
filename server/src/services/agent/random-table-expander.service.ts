import { generateTextWithTimeout } from '../generation/model-timeouts.js';
import { parseJsonResponse } from '../generation/parse-json.js';
import { resolveAgentModelForUser } from './model-resolution.service.js';
import { prisma } from '../../config/database.js';
import type { CritiqueBacklogItem, DocumentContent } from '@dnd-booker/shared';
import {
  assessRandomTableEntries,
  strengthenRandomTableEntries,
} from '@dnd-booker/shared';
import { buildResolvedPublicationDocumentWriteData } from '../document-publication.service.js';

interface NormalizedRandomTableEntry {
  roll: string;
  result: string;
}

function cloneNode<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function expandEntriesWithModel(input: {
  userId: string;
  documentTitle: string;
  tableTitle: string;
  entries: NormalizedRandomTableEntry[];
}) {
  const { model, maxOutputTokens } = await resolveAgentModelForUser(input.userId, {
    agentKey: 'agent.random_table_expansion',
  });
  const system = [
    'You improve D&D random encounter and complication tables for Dungeon Masters.',
    'Return JSON only.',
    'Preserve each roll range exactly.',
    'Each result must be runnable at the table with a concrete clue, danger, obstacle, or NPC reaction.',
    'Aim for 14-28 words per entry.',
  ].join(' ');
  const prompt = [
    `Document: ${input.documentTitle}`,
    `Table: ${input.tableTitle}`,
    'Rewrite these entries into stronger runnable results.',
    JSON.stringify(input.entries, null, 2),
    'Return: {"entries":[{"roll":"1","result":"..."}]}',
  ].join('\n\n');

  const { text } = await generateTextWithTimeout('Agent random-table expansion', {
    model,
    system,
    prompt,
    maxOutputTokens: Math.min(maxOutputTokens, 4096),
  });

  const parsed = parseJsonResponse(text) as { entries?: unknown };
  const nextEntries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  return nextEntries;
}

function transformRandomTables(
  node: DocumentContent,
  targetTitle: string | null,
  mutator: (attrs: Record<string, unknown>) => Promise<Record<string, unknown> | null>,
): Promise<{ node: DocumentContent; updatedCount: number }> {
  async function visit(current: DocumentContent): Promise<{ node: DocumentContent; updatedCount: number }> {
    let updatedCount = 0;

    const nextNode = cloneNode(current);
    if (nextNode.type === 'randomTable') {
      const title = typeof nextNode.attrs?.title === 'string'
        ? nextNode.attrs.title
        : typeof nextNode.attrs?.name === 'string'
          ? nextNode.attrs.name
          : '';

      if (!targetTitle || title.trim() === targetTitle.trim() || targetTitle.trim().length === 0) {
        const nextAttrs = await mutator((nextNode.attrs ?? {}) as Record<string, unknown>);
        if (nextAttrs) {
          nextNode.attrs = nextAttrs;
          updatedCount += 1;
        }
      }
    }

    if (Array.isArray(nextNode.content) && nextNode.content.length > 0) {
      const children: DocumentContent[] = [];
      for (const child of nextNode.content) {
        const transformed = await visit(child);
        children.push(transformed.node);
        updatedCount += transformed.updatedCount;
      }
      nextNode.content = children;
    }

    return { node: nextNode, updatedCount };
  }

  return visit(node);
}

export async function expandRandomTablesFromBacklog(input: {
  projectId: string;
  userId: string;
  backlog: CritiqueBacklogItem[];
  limit?: number;
}) {
  const tableTargets = input.backlog
    .filter((item) => item.code === 'EXPORT_THIN_RANDOM_TABLE')
    .slice(0, input.limit ?? 2);

  if (tableTargets.length === 0) {
    return {
      documentsUpdated: 0,
      tablesExpanded: 0,
      updatedTitles: [] as string[],
    };
  }

  const titleFilters = Array.from(new Set(tableTargets.map((item) => item.targetTitle).filter((value): value is string => Boolean(value))));
  const documents = await prisma.projectDocument.findMany({
    where: {
      projectId: input.projectId,
      ...(titleFilters.length > 0 ? { title: { in: titleFilters } } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  });

  let documentsUpdated = 0;
  let tablesExpanded = 0;
  const updatedTitles: string[] = [];

  for (const document of documents) {
    let documentUpdated = false;
    let updatedContent = document.content as unknown as DocumentContent;

    const matchingBacklog = tableTargets.filter((item) => !item.targetTitle || item.targetTitle === document.title);
    for (const backlogItem of matchingBacklog) {
      const transformed = await transformRandomTables(
        updatedContent,
        null,
        async (attrs) => {
          const assessment = assessRandomTableEntries(attrs.entries ?? attrs.results);
          if (!assessment.isThin) return null;

          let nextEntries = strengthenRandomTableEntries(assessment.normalizedEntries);
          try {
            const generatedEntries = await expandEntriesWithModel({
              userId: input.userId,
              documentTitle: document.title,
              tableTitle: String(attrs.title ?? attrs.name ?? document.title),
              entries: assessment.normalizedEntries,
            });
            const generatedAssessment = assessRandomTableEntries(
              strengthenRandomTableEntries(generatedEntries),
            );
            if (
              generatedAssessment.normalizedEntries.length === assessment.normalizedEntries.length
              && generatedAssessment.thinEntryCount <= assessment.thinEntryCount
            ) {
              nextEntries = generatedAssessment.normalizedEntries;
            }
          } catch {
            // Fall back to deterministic expansion if the model call fails.
          }

          const nextAssessment = assessRandomTableEntries(
            strengthenRandomTableEntries(nextEntries),
          );
          if (nextAssessment.thinEntryCount > assessment.thinEntryCount) {
            return null;
          }

          return {
            ...attrs,
            entries: JSON.stringify(nextAssessment.normalizedEntries),
          };
        },
      );

      if (transformed.updatedCount > 0) {
        updatedContent = transformed.node;
        tablesExpanded += transformed.updatedCount;
        documentUpdated = true;
      }
    }

    if (!documentUpdated) continue;

    const writeData = buildResolvedPublicationDocumentWriteData({
      content: updatedContent,
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
    updatedTitles.push(document.title);
  }

  return {
    documentsUpdated,
    tablesExpanded,
    updatedTitles,
  };
}
