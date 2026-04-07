import type { ExportJob, ExportReview } from '@dnd-booker/shared';
import { screen } from '@testing-library/react';
import { ExportDialog } from './ExportDialog';
import { useExportStore } from '../../stores/exportStore';
import { useProjectStore } from '../../stores/projectStore';
import { renderWithProviders } from '../../test/render';

function buildReview(): ExportReview {
  return {
    status: 'needs_attention',
    score: 78,
    generatedAt: '2026-03-31T20:00:00.000Z',
    summary: 'Parity drift needs attention.',
    passCount: 2,
    appliedFixes: ['refresh_layout_plan'],
    findings: [
      {
        code: 'EXPORT_TEXT_LAYOUT_GROUP_SPLIT_DRIFT',
        severity: 'error',
        page: null,
        message: '"The Descent Begins" contains grouped layout regions that land on different pages.',
        details: {
          title: 'The Descent Begins',
          documentId: 'doc-1',
          scopeId: 'group:utility-table-1',
          groupId: 'utility-table-1',
          scopes: [{ scopeId: 'group:utility-table-1', nodeId: null, groupId: 'utility-table-1' }],
        },
      },
      {
        code: 'EXPORT_TEXT_LAYOUT_FALLBACK_RECOMMENDED',
        severity: 'warning',
        page: null,
        message: 'Persisting scoped legacy fallback would stabilize "The Descent Begins".',
        details: {
          title: 'The Descent Begins',
          documentId: 'doc-1',
          scopeId: 'unit:read-aloud-box-1',
          nodeId: 'read-aloud-box-1',
        },
      },
      {
        code: 'EXPORT_SECTION_TITLE_WRAP',
        severity: 'warning',
        page: 3,
        message: 'Section title wraps awkwardly near the top of the page.',
        details: {
          title: 'The Descent Begins',
        },
      },
    ],
    metrics: {
      pageCount: 8,
      pageWidthPts: 612,
      pageHeightPts: 792,
      lastPageFillRatio: 0.62,
      sectionStarts: [],
      utilityCoverage: [],
      textLayoutParity: {
        mode: 'shadow',
        legacyPageCount: 9,
        enginePageCount: 8,
        supportedUnitCount: 24,
        unsupportedUnitCount: 2,
        totalHeightDeltaPx: -37,
        driftScopeIds: ['group:utility-table-1', 'unit:read-aloud-box-1'],
        unsupportedScopeIds: ['group:map-block-1'],
      },
    },
  };
}

function buildJob(review: ExportReview): ExportJob {
  return {
    id: 'export-job-1',
    projectId: 'project-1',
    userId: 'user-1',
    format: 'pdf',
    status: 'completed',
    progress: 100,
    outputUrl: '/api/v1/export-jobs/export-job-1/download',
    errorMessage: null,
    review,
    createdAt: '2026-03-31T20:00:00.000Z',
    completedAt: '2026-03-31T20:10:00.000Z',
  };
}

describe('ExportDialog parity review UI', () => {
  it('renders parity metrics, separates parity findings, and treats parity findings as safe-fixable', () => {
    const review = buildReview();
    const job = buildJob(review);

    useExportStore.setState({
      isOpen: true,
      job,
      isExporting: false,
      isApplyingFixes: false,
      error: null,
      fixSummary: null,
      fixChanges: [],
      exportHistory: [],
      fetchExportHistory: vi.fn().mockResolvedValue(undefined),
      applyReviewFixes: vi.fn().mockResolvedValue(undefined),
      closeDialog: vi.fn(),
      reset: vi.fn(),
    });

    useProjectStore.setState({
      documents: [
        {
          id: 'doc-1',
          projectId: 'project-1',
          runId: null,
          kind: 'chapter',
          title: 'The Descent Begins',
          slug: 'the-descent-begins',
          sortOrder: 0,
          targetPageCount: null,
          outlineJson: null,
          layoutPlan: null,
          content: { type: 'doc', content: [] },
          status: 'draft',
          sourceArtifactId: null,
          createdAt: '2026-03-31T20:00:00.000Z',
          updatedAt: '2026-03-31T20:00:00.000Z',
        },
      ],
      loadDocument: vi.fn().mockResolvedValue(undefined),
    });

    renderWithProviders(<ExportDialog projectId="project-1" />);

    expect(screen.getByText('Text layout parity')).toBeInTheDocument();
    expect(screen.getByText('Mode: shadow')).toBeInTheDocument();
    expect(screen.getByText('Pages: 9 legacy / 8 engine')).toBeInTheDocument();
    expect(screen.getByText('Height delta: -37 px')).toBeInTheDocument();
    expect(screen.getByText('Text layout parity findings')).toBeInTheDocument();
    expect(screen.getByText('Grouped region: utility table 1')).toBeInTheDocument();
    expect(screen.getByText('Block: read aloud box 1')).toBeInTheDocument();
    expect(screen.getByText('Section title wraps awkwardly near the top of the page.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply Safe Fixes & Re-export' })).toBeInTheDocument();
  });
});
