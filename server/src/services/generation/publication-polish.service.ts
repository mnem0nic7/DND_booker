import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import type { PreflightResult } from './preflight.service.js';
import { analyzeEstimatedArtifactLayout } from './layout-estimate.service.js';
import {
  applyPublicationPolishEdits,
  derivePublicationPolishEdits,
  type PublicationPolishEdit,
} from './publication-polish.helpers.js';
import { buildResolvedPublicationDocumentWriteData } from '../document-publication.service.js';

interface ProjectDocumentRecord {
  id: string;
  slug: string;
  title: string;
  kind: string;
  layoutPlan?: unknown;
  content: unknown;
  canonicalVersion?: number | null;
  editorProjectionVersion?: number | null;
  typstVersion?: number | null;
}

export interface PublicationPolishDocumentReport {
  documentId: string;
  documentSlug: string;
  title: string;
  kind: string;
  preflightIssueCodes: string[];
  operations: PublicationPolishEdit[];
  updated: boolean;
  initialLayoutSummary: string | null;
  finalLayoutSummary: string | null;
  initialFindingCodes: string[];
  finalFindingCodes: string[];
}

export interface PublicationPolishResult {
  reportArtifactId: string;
  documentsAnalyzed: number;
  documentsUpdated: number;
  operationsApplied: number;
  polishableIssuesSeen: number;
  remainingPolishableIssues: number;
}

const POLISHABLE_PREFLIGHT_CODES = new Set([
  'LAYOUT_CONSECUTIVE_PAGE_BREAKS',
  'LAYOUT_NEARLY_BLANK_PAGE_AFTER_BREAK',
  'LAYOUT_CHAPTER_HEADING_MID_PAGE',
  'LAYOUT_REFERENCE_BLOCK_STRANDED_AFTER_BREAK',
]);

const POLISHABLE_LAYOUT_CODES = new Set([
  'CONSECUTIVE_PAGE_BREAKS',
  'NEARLY_BLANK_PAGE_AFTER_BREAK',
  'CHAPTER_HEADING_MID_PAGE',
  'REFERENCE_BLOCK_STRANDED_AFTER_BREAK',
]);

function buildIssueMap(preflight?: Pick<PreflightResult, 'issues'>): Map<string, string[]> {
  const issueMap = new Map<string, string[]>();

  for (const issue of preflight?.issues ?? []) {
    if (!issue.documentSlug) continue;
    const existing = issueMap.get(issue.documentSlug) ?? [];
    existing.push(issue.code);
    issueMap.set(issue.documentSlug, existing);
  }

  return issueMap;
}

function countPolishableIssueCodes(codes: string[]): number {
  return codes.filter((code) => POLISHABLE_PREFLIGHT_CODES.has(code) || POLISHABLE_LAYOUT_CODES.has(code)).length;
}

function buildReportSummary(
  documentsUpdated: number,
  operationsApplied: number,
  polishableIssuesSeen: number,
  remainingPolishableIssues: number,
): string {
  if (operationsApplied === 0 && polishableIssuesSeen === 0) {
    return 'Publication polish found no safe structural cleanup work to apply.';
  }

  if (operationsApplied === 0) {
    return `Publication polish found ${polishableIssuesSeen} polishable issue(s) but no safe automatic fixes were available.`;
  }

  return [
    `Publication polish applied ${operationsApplied} structural fix(es) across ${documentsUpdated} document(s).`,
    `Polishable issues seen: ${polishableIssuesSeen}.`,
    `Remaining polishable issues after cleanup: ${remainingPolishableIssues}.`,
  ].join(' ');
}

export async function executePublicationPolish(
  run: { id: string; projectId: string },
  preflight?: Pick<PreflightResult, 'issues'>,
): Promise<PublicationPolishResult> {
  const documents = await prisma.projectDocument.findMany({
    where: { runId: run.id, projectId: run.projectId },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      layoutPlan: true,
      content: true,
      canonicalVersion: true,
      editorProjectionVersion: true,
      typstVersion: true,
    },
  }) as ProjectDocumentRecord[];

  const issueMap = buildIssueMap(preflight);
  const documentReports: PublicationPolishDocumentReport[] = [];

  let documentsUpdated = 0;
  let operationsApplied = 0;
  let polishableIssuesSeen = 0;
  let remainingPolishableIssues = 0;

  for (const doc of documents) {
    const initialLayout = analyzeEstimatedArtifactLayout(doc.content);
    const operations = derivePublicationPolishEdits(doc.content, initialLayout?.findings ?? []);
    const updatedContent = applyPublicationPolishEdits(doc.content, operations);
    const updated = operations.length > 0;

    if (updated) {
      const writeData = buildResolvedPublicationDocumentWriteData({
        content: updatedContent,
        layoutPlan: doc.layoutPlan ?? null,
        kind: doc.kind,
        title: doc.title,
        versions: {
          canonicalVersion: doc.canonicalVersion,
          editorProjectionVersion: doc.editorProjectionVersion,
          typstVersion: doc.typstVersion,
        },
        bumpVersions: true,
      });
      await prisma.projectDocument.update({
        where: { id: doc.id },
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
      operationsApplied += operations.length;
    }

    const finalLayout = analyzeEstimatedArtifactLayout(updatedContent);
    const preflightIssueCodes = issueMap.get(doc.slug) ?? [];
    const initialFindingCodes = initialLayout?.findings.map((finding) => finding.code) ?? [];
    const finalFindingCodes = finalLayout?.findings.map((finding) => finding.code) ?? [];

    polishableIssuesSeen += countPolishableIssueCodes([
      ...preflightIssueCodes,
      ...initialFindingCodes,
    ]);
    remainingPolishableIssues += countPolishableIssueCodes(finalFindingCodes);

    documentReports.push({
      documentId: doc.id,
      documentSlug: doc.slug,
      title: doc.title,
      kind: doc.kind,
      preflightIssueCodes,
      operations,
      updated,
      initialLayoutSummary: initialLayout?.summary ?? null,
      finalLayoutSummary: finalLayout?.summary ?? null,
      initialFindingCodes,
      finalFindingCodes,
    });
  }

  const latest = await prisma.generatedArtifact.findFirst({
    where: {
      runId: run.id,
      artifactType: 'publication_polish_report',
      artifactKey: 'publication-polish-report',
    },
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  const report = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'publication_polish_report',
      artifactKey: 'publication-polish-report',
      status: 'accepted',
      version: (latest?.version ?? 0) + 1,
      title: 'Publication Polish Report',
      summary: buildReportSummary(
        documentsUpdated,
        operationsApplied,
        polishableIssuesSeen,
        remainingPolishableIssues,
      ),
      jsonContent: {
        stats: {
          documentsAnalyzed: documents.length,
          documentsUpdated,
          operationsApplied,
          polishableIssuesSeen,
          remainingPolishableIssues,
        },
        documents: documentReports,
      } as any,
      metadata: {
        documentsAnalyzed: documents.length,
        documentsUpdated,
        operationsApplied,
        polishableIssuesSeen,
        remainingPolishableIssues,
      } as any,
    },
  });

  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: report.id,
    artifactType: report.artifactType,
    title: report.title,
    version: report.version,
  });

  return {
    reportArtifactId: report.id,
    documentsAnalyzed: documents.length,
    documentsUpdated,
    operationsApplied,
    polishableIssuesSeen,
    remainingPolishableIssues,
  };
}
