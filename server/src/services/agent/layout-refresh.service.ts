import type { ExportReview, LayoutPlan } from '@dnd-booker/shared';
import { recommendLayoutPlan } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { buildResolvedPublicationDocumentWriteData } from '../document-publication.service.js';

function extractFindingCodesForTitle(review: ExportReview, title: string): string[] {
  return review.findings
    .filter((finding) => {
      const detailsTitle = finding.details && typeof finding.details === 'object'
        ? (finding.details as Record<string, unknown>).title
        : null;
      return typeof detailsTitle === 'string' && detailsTitle.trim() === title;
    })
    .map((finding) => finding.code);
}

export async function refreshLayoutPlansFromReview(input: {
  projectId: string;
  review: ExportReview;
  targetTitle?: string | null;
}) {
  const documents = await prisma.projectDocument.findMany({
    where: {
      projectId: input.projectId,
      ...(input.targetTitle ? { title: input.targetTitle } : {}),
    },
    orderBy: { sortOrder: 'asc' },
  });

  let documentsUpdated = 0;
  const updatedTitles: string[] = [];

  for (const document of documents) {
    const findingCodes = extractFindingCodesForTitle(input.review, document.title);
    if (input.targetTitle && document.title === input.targetTitle && findingCodes.length === 0) {
      findingCodes.push('EXPORT_UNUSED_PAGE_REGION');
    }
    if (findingCodes.length === 0 && !input.targetTitle) continue;

    const writeData = buildResolvedPublicationDocumentWriteData({
      content: document.content,
      layoutPlan: document.layoutPlan,
      kind: document.kind,
      title: document.title,
      versions: {
        canonicalVersion: document.canonicalVersion,
        editorProjectionVersion: document.editorProjectionVersion,
        typstVersion: document.typstVersion,
      },
    });
    const recommendedLayout = recommendLayoutPlan(
      writeData.content as any,
      writeData.layoutPlan as any,
      {
        reviewCodes: findingCodes,
        documentKind: document.kind,
        documentTitle: document.title,
      },
    );

    if (JSON.stringify(recommendedLayout) === JSON.stringify((document.layoutPlan as LayoutPlan | null) ?? null)) {
      continue;
    }

    await prisma.projectDocument.update({
      where: { id: document.id },
      data: {
        content: writeData.content,
        layoutPlan: recommendedLayout as any,
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
    updatedTitles,
  };
}
