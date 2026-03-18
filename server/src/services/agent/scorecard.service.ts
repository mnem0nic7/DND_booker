import type {
  AgentScorecard,
  CritiqueBacklogItem,
  ExportReview,
  ExportReviewFinding,
} from '@dnd-booker/shared';

function findingPriority(finding: ExportReviewFinding): number {
  const severityScore = (() => {
    switch (finding.severity) {
      case 'error':
        return 100;
      case 'warning':
        return 60;
      default:
        return 20;
    }
  })();

  const codeBonus = (() => {
    switch (finding.code) {
      case 'EXPORT_PLACEHOLDER_STAT_BLOCK':
      case 'EXPORT_INCOMPLETE_STAT_BLOCK':
      case 'EXPORT_INCOMPLETE_ENCOUNTER_PACKET':
        return 25;
      case 'EXPORT_THIN_RANDOM_TABLE':
        return 18;
      case 'EXPORT_SUSPICIOUS_STAT_BLOCK':
        return 12;
      case 'EXPORT_LOW_UTILITY_DENSITY':
        return 10;
      case 'EXPORT_UNUSED_PAGE_REGION':
      case 'EXPORT_MISSED_ART_OPPORTUNITY':
      case 'EXPORT_WEAK_HERO_PLACEMENT':
      case 'EXPORT_SPLIT_SCENE_PACKET':
      case 'EXPORT_UNBALANCED_COLUMNS':
      case 'EXPORT_MARGIN_COLLISION':
      case 'EXPORT_FOOTER_COLLISION':
      case 'EXPORT_ORPHAN_TAIL_PARAGRAPH':
        return 8;
      default:
        return 0;
    }
  })();

  return severityScore + codeBonus;
}

function buildBacklogItem(finding: ExportReviewFinding, index: number): CritiqueBacklogItem {
  const title = finding.details && typeof finding.details === 'object'
    ? (finding.details as Record<string, unknown>).title
    : null;

  return {
    id: `${finding.code}-${index + 1}`,
    code: finding.code,
    title: finding.code.replace(/^EXPORT_/, '').replace(/_/g, ' '),
    detail: finding.message,
    severity: finding.severity,
    priority: findingPriority(finding),
    targetTitle: typeof title === 'string' && title.trim().length > 0 ? title.trim() : null,
    page: finding.page ?? null,
  };
}

export function buildScorecardFromExportReview(
  exportJobId: string,
  review: ExportReview,
): { scorecard: AgentScorecard; backlog: CritiqueBacklogItem[] } {
  const warningFindingCount = review.findings.filter((finding) => finding.severity === 'warning').length;
  const blockingFindingCount = review.findings.filter((finding) => finding.severity === 'error').length;
  const sparsePageCount = review.findings.filter((finding) => (
    finding.code === 'EXPORT_UNUSED_PAGE_REGION'
    || finding.code === 'EXPORT_MISSED_ART_OPPORTUNITY'
  )).length;
  const thinRandomTableCount = review.findings.filter((finding) => finding.code === 'EXPORT_THIN_RANDOM_TABLE').length;
  const lowUtilityDensityCount = review.findings.filter((finding) => finding.code === 'EXPORT_LOW_UTILITY_DENSITY').length;
  const suspiciousStatBlockCount = review.findings.filter((finding) => (
    finding.code === 'EXPORT_SUSPICIOUS_STAT_BLOCK'
    || finding.code === 'EXPORT_PLACEHOLDER_STAT_BLOCK'
    || finding.code === 'EXPORT_INCOMPLETE_STAT_BLOCK'
    || finding.code === 'EXPORT_INCOMPLETE_ENCOUNTER_PACKET'
  )).length;
  const utilityDensityAverage = review.metrics.utilityCoverage.length > 0
    ? Number(
        (
          review.metrics.utilityCoverage.reduce((sum, entry) => sum + entry.utilityDensity, 0)
          / review.metrics.utilityCoverage.length
        ).toFixed(3),
      )
    : null;

  const backlog = review.findings.map(buildBacklogItem).sort((left, right) => right.priority - left.priority);

  return {
    scorecard: {
      overallScore: review.score,
      exportScore: review.score,
      blockingFindingCount,
      warningFindingCount,
      utilityDensityAverage,
      sparsePageCount,
      thinRandomTableCount,
      lowUtilityDensityCount,
      suspiciousStatBlockCount,
      generatedAt: review.generatedAt,
      summary: review.summary,
      latestExportJobId: exportJobId,
    },
    backlog,
  };
}

export function isTargetQuality(scorecard: AgentScorecard): boolean {
  return scorecard.overallScore >= 90
    && scorecard.blockingFindingCount === 0
    && scorecard.thinRandomTableCount === 0
    && scorecard.sparsePageCount === 0
    && scorecard.lowUtilityDensityCount === 0
    && scorecard.suspiciousStatBlockCount === 0;
}

export function isMeaningfulImprovement(
  previous: AgentScorecard | null,
  next: AgentScorecard,
): boolean {
  if (!previous) return true;
  if (next.overallScore >= previous.overallScore + 3) return true;
  if (next.blockingFindingCount < previous.blockingFindingCount) return true;
  if (next.thinRandomTableCount < previous.thinRandomTableCount) return true;
  if (next.suspiciousStatBlockCount < previous.suspiciousStatBlockCount) return true;
  if (next.lowUtilityDensityCount < previous.lowUtilityDensityCount) return true;
  return next.sparsePageCount < previous.sparsePageCount;
}
