import type {
  ExportReview,
  ExportReviewCode,
  ExportReviewFinding,
  ExportReviewFixChange,
} from '@dnd-booker/shared';

const TEXT_LAYOUT_PARITY_CODES = new Set<ExportReviewCode>([
  'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT',
  'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT',
  'EXPORT_TEXT_LAYOUT_MANUAL_BREAK_DRIFT',
  'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
]);

interface ScopeDetail {
  scopeId: string;
  nodeId: string | null;
  groupId: string | null;
}

export function isTextLayoutParityFinding(finding: ExportReviewFinding): boolean {
  return TEXT_LAYOUT_PARITY_CODES.has(finding.code);
}

export function splitExportReviewFindings(review: ExportReview): {
  parityFindings: ExportReviewFinding[];
  generalFindings: ExportReviewFinding[];
} {
  const parityFindings = review.findings.filter(isTextLayoutParityFinding);
  const generalFindings = review.findings.filter((finding) => !isTextLayoutParityFinding(finding));
  return { parityFindings, generalFindings };
}

export function getExportReviewFindingDocumentTitle(finding: ExportReviewFinding): string | null {
  const title = finding.details && typeof finding.details === 'object'
    ? (finding.details as Record<string, unknown>).title
    : null;
  return typeof title === 'string' && title.trim().length > 0 ? title.trim() : null;
}

function parseScopeDetail(value: unknown): ScopeDetail | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const scopeId = typeof (value as { scopeId?: unknown }).scopeId === 'string'
    ? String((value as { scopeId?: string }).scopeId)
    : null;
  if (!scopeId) return null;
  return {
    scopeId,
    nodeId: typeof (value as { nodeId?: unknown }).nodeId === 'string'
      ? String((value as { nodeId?: string }).nodeId)
      : null,
    groupId: typeof (value as { groupId?: unknown }).groupId === 'string'
      ? String((value as { groupId?: string }).groupId)
      : null,
  };
}

function humanizeScopeId(scopeId: string): string {
  return scopeId.replace(/^(group|unit):/, '').replace(/[-_]+/g, ' ').trim();
}

function formatScopeLabel(scope: ScopeDetail): string {
  if (scope.groupId) return `Grouped region: ${humanizeScopeId(scope.groupId)}`;
  if (scope.nodeId) return `Block: ${humanizeScopeId(scope.nodeId)}`;
  if (scope.scopeId.startsWith('group:')) return `Grouped region: ${humanizeScopeId(scope.scopeId)}`;
  if (scope.scopeId.startsWith('unit:')) return `Block: ${humanizeScopeId(scope.scopeId)}`;
  return humanizeScopeId(scope.scopeId);
}

export function getTextLayoutParityScopeLabels(finding: ExportReviewFinding): string[] {
  const details = finding.details;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return [];

  const scopedDetails = details as {
    scopes?: unknown;
    scopeId?: unknown;
    nodeId?: unknown;
    groupId?: unknown;
  };

  const explicitScopes = Array.isArray(scopedDetails.scopes)
    ? scopedDetails.scopes.map(parseScopeDetail).filter((scope): scope is ScopeDetail => scope != null)
    : [];

  if (explicitScopes.length > 0) {
    return [...new Set(explicitScopes.map(formatScopeLabel))];
  }

  const fallbackScope = parseScopeDetail({
    scopeId: typeof scopedDetails.scopeId === 'string' ? scopedDetails.scopeId : null,
    nodeId: typeof scopedDetails.nodeId === 'string' ? scopedDetails.nodeId : null,
    groupId: typeof scopedDetails.groupId === 'string' ? scopedDetails.groupId : null,
  });

  return fallbackScope ? [formatScopeLabel(fallbackScope)] : [];
}

export function formatExportReviewFixChange(change: ExportReviewFixChange): string {
  const actionLabel = (() => {
    switch (change.action) {
      case 'normalize_page_breaks':
        return 'Normalized manual page breaks';
      case 'configure_text_layout_fallbacks':
        return 'Configured scoped legacy fallback';
      case 'refresh_layout_plan':
        return 'Refreshed layout plan';
      case 'remove_empty_encounter_tables':
        return 'Removed empty encounter tables';
      case 'remove_empty_random_tables':
        return 'Removed empty random tables';
      case 'remove_placeholder_stat_blocks':
        return 'Removed placeholder stat blocks';
      case 'demote_oversized_display_headings':
        return 'Demoted oversized display headings';
      case 'generate_spot_art':
        return 'Generated spot art';
      default:
        return String(change.action).replace(/_/g, ' ');
    }
  })();

  const title = change.title?.trim();
  const countLabel = change.count === 1 ? '1 change' : `${change.count} changes`;
  return title ? `${actionLabel} in ${title} (${countLabel})` : `${actionLabel} (${countLabel})`;
}
