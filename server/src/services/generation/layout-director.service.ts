import {
  buildDefaultLayoutPlan,
  compilePageModel,
  ensureStableNodeIds,
  type DocumentContent,
  type LayoutRecipe,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

interface LayoutDirectedDocumentSummary {
  documentId: string;
  slug: string;
  title: string;
  kind: string;
  sectionRecipe: LayoutRecipe | null;
  fragmentCount: number;
  heroFragmentCount: number;
  groupedFragmentCount: number;
}

export interface LayoutDirectorResult {
  artifactId: string | null;
  documentsUpdated: number;
  documentCount: number;
  summaries: LayoutDirectedDocumentSummary[];
}

function asDocumentContent(value: unknown): DocumentContent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as DocumentContent;
}

export async function executeLayoutDirectorPass(run: { id: string; projectId: string }): Promise<LayoutDirectorResult> {
  const documents = await prisma.projectDocument.findMany({
    where: { runId: run.id, projectId: run.projectId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      content: true,
      layoutPlan: true,
    },
  });

  if (documents.length === 0) {
    return {
      artifactId: null,
      documentsUpdated: 0,
      documentCount: 0,
      summaries: [],
    };
  }

  let documentsUpdated = 0;
  const summaries: LayoutDirectedDocumentSummary[] = [];

  for (const document of documents) {
    const content = asDocumentContent(document.content);
    if (!content) continue;

    const normalizedContent = ensureStableNodeIds(content);
    const layoutPlan = buildDefaultLayoutPlan(normalizedContent, {
      documentKind: document.kind,
      documentTitle: document.title,
    });
    const pageModel = compilePageModel(normalizedContent, layoutPlan, 'standard_pdf', {
      documentKind: document.kind,
      documentTitle: document.title,
    });

    if (
      JSON.stringify(normalizedContent) !== JSON.stringify(document.content)
      || JSON.stringify(layoutPlan) !== JSON.stringify(document.layoutPlan)
    ) {
      await prisma.projectDocument.update({
        where: { id: document.id },
        data: {
          content: normalizedContent as any,
          layoutPlan: layoutPlan as any,
        },
      });
      documentsUpdated += 1;
    }

    summaries.push({
      documentId: document.id,
      slug: document.slug,
      title: document.title,
      kind: document.kind,
      sectionRecipe: layoutPlan.sectionRecipe,
      fragmentCount: pageModel.metrics.fragmentCount,
      heroFragmentCount: pageModel.metrics.heroFragmentCount,
      groupedFragmentCount: pageModel.metrics.groupedFragmentCount,
    });
  }

  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'layout_plan',
      artifactKey: 'layout-plan',
      status: 'accepted',
      version: 1,
      title: 'Layout Plan',
      summary: `Applied canonical layout plans to ${summaries.length} document${summaries.length === 1 ? '' : 's'}.`,
      jsonContent: {
        documentsUpdated,
        documents: summaries,
      } as any,
    },
  });

  return {
    artifactId: artifact.id,
    documentsUpdated,
    documentCount: summaries.length,
    summaries,
  };
}
