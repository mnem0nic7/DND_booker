import {
  compilePageModel,
  ensureStableNodeIds,
  recommendLayoutPlan,
  type DocumentContent,
  type LayoutRecipe,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { materializeSparsePageArt } from '../layout-art.service.js';
import { buildResolvedPublicationDocumentWriteData } from '../document-publication.service.js';
import { rebuildProjectContentCache } from '../project-document-content.service.js';
import { createVersionedArtifact } from './agentic-artifacts.service.js';

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
      canonicalVersion: true,
      editorProjectionVersion: true,
      typstVersion: true,
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

    let normalizedContent = ensureStableNodeIds(content);
    let layoutPlan = recommendLayoutPlan(normalizedContent, document.layoutPlan as any, {
      documentKind: document.kind,
      documentTitle: document.title,
    });
    let pageModel = compilePageModel(normalizedContent, layoutPlan, 'standard_pdf', {
      documentKind: document.kind,
      documentTitle: document.title,
    });

    const baselineArt = materializeSparsePageArt({
      content: normalizedContent,
      kind: document.kind,
      title: document.title,
    });
    if (baselineArt.changed) {
      normalizedContent = baselineArt.content;
      layoutPlan = recommendLayoutPlan(normalizedContent, layoutPlan, {
        documentKind: document.kind,
        documentTitle: document.title,
      });
      pageModel = compilePageModel(normalizedContent, layoutPlan, 'standard_pdf', {
        documentKind: document.kind,
        documentTitle: document.title,
      });
    }

    const hasSparseEstimatedPage = pageModel.pages.some((page) => {
      const isOpener = page.fragments.some((fragment) => (
        fragment.isOpener || fragment.isHero || fragment.nodeType === 'chapterHeader'
      ));
      const isLastPage = page.index === pageModel.pages.length;
      if (isOpener) return false;
      if (isLastPage) return page.fillRatio < 0.42;
      return page.fillRatio < 0.58;
    });

    const hasSeverelyUnbalancedPage = pageModel.pages.some((page) => {
      const isOpener = page.fragments.some((fragment) => (
        fragment.isOpener || fragment.isHero || fragment.nodeType === 'chapterHeader'
      ));
      if (isOpener) return false;
      return (page.columnMetrics.deltaRatio ?? 0) >= 0.28;
    });

    if (hasSparseEstimatedPage || hasSeverelyUnbalancedPage) {
      const augmented = materializeSparsePageArt({
        content: normalizedContent,
        kind: document.kind,
        title: document.title,
        reviewCodes: [
          ...(hasSparseEstimatedPage ? ['EXPORT_UNUSED_PAGE_REGION'] : []),
          ...(hasSeverelyUnbalancedPage ? ['EXPORT_UNBALANCED_COLUMNS'] : []),
        ],
      });

      if (augmented.changed) {
        normalizedContent = augmented.content;
        layoutPlan = recommendLayoutPlan(normalizedContent, layoutPlan, {
          documentKind: document.kind,
          documentTitle: document.title,
          reviewCodes: [
            ...(hasSparseEstimatedPage ? ['EXPORT_UNUSED_PAGE_REGION'] : []),
            ...(hasSeverelyUnbalancedPage ? ['EXPORT_UNBALANCED_COLUMNS'] : []),
          ],
        });
        pageModel = compilePageModel(normalizedContent, layoutPlan, 'standard_pdf', {
          documentKind: document.kind,
          documentTitle: document.title,
        });
      }
    }

    if (
      JSON.stringify(normalizedContent) !== JSON.stringify(document.content)
      || JSON.stringify(layoutPlan) !== JSON.stringify(document.layoutPlan)
    ) {
      const writeData = buildResolvedPublicationDocumentWriteData({
        content: normalizedContent,
        layoutPlan,
        kind: document.kind,
        title: document.title,
        versions: {
          canonicalVersion: document.canonicalVersion,
          editorProjectionVersion: document.editorProjectionVersion,
          typstVersion: document.typstVersion,
        },
        bumpVersions: JSON.stringify(normalizedContent) !== JSON.stringify(document.content),
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

  if (documentsUpdated > 0) {
    await rebuildProjectContentCache(run.projectId);
  }

  const artifact = await createVersionedArtifact({
    runId: run.id,
    projectId: run.projectId,
    artifactType: 'layout_plan',
    artifactKey: 'layout-plan',
    status: 'accepted',
    title: 'Layout Plan',
    summary: `Applied canonical layout plans to ${summaries.length} document${summaries.length === 1 ? '' : 's'}.`,
    jsonContent: {
      documentsUpdated,
      documents: summaries,
    } as any,
  });

  return {
    artifactId: artifact.id,
    documentsUpdated,
    documentCount: summaries.length,
    summaries,
  };
}
