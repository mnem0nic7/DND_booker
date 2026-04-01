import type { ExportReview, GeneratedArtifact } from '@dnd-booker/shared';
import { screen } from '@testing-library/react';
import { ArtifactReviewPanel } from './ArtifactReviewPanel';
import { useGenerationStore } from '../../stores/generationStore';
import { renderWithProviders } from '../../test/render';

function buildReview(): ExportReview {
  return {
    status: 'needs_attention',
    score: 74,
    generatedAt: '2026-03-31T20:00:00.000Z',
    summary: 'Export review detected parity drift.',
    passCount: 1,
    appliedFixes: [],
    findings: [
      {
        code: 'EXPORT_TEXT_LAYOUT_PAGE_COUNT_DRIFT',
        severity: 'warning',
        page: null,
        message: '"Into the Mire" paginates differently between legacy and Pretext.',
        details: {
          title: 'Into the Mire',
          documentId: 'doc-2',
          scopeId: 'group:intro-tail-panel-1',
          scopes: [{ scopeId: 'group:intro-tail-panel-1', nodeId: null, groupId: 'intro-tail-panel-1' }],
        },
      },
      {
        code: 'EXPORT_LAST_PAGE_UNDERFILLED',
        severity: 'warning',
        page: 5,
        message: 'The final page is visually sparse.',
        details: {
          title: 'Into the Mire',
        },
      },
    ],
    metrics: {
      pageCount: 5,
      pageWidthPts: 612,
      pageHeightPts: 792,
      lastPageFillRatio: 0.21,
      sectionStarts: [],
      utilityCoverage: [],
      textLayoutParity: {
        mode: 'pretext',
        legacyPageCount: 6,
        enginePageCount: 5,
        supportedUnitCount: 31,
        unsupportedUnitCount: 1,
        totalHeightDeltaPx: 42,
        driftScopeIds: ['group:intro-tail-panel-1'],
        unsupportedScopeIds: [],
      },
    },
  };
}

function buildArtifact(review: ExportReview): GeneratedArtifact & { evaluations?: [] } {
  return {
    id: 'artifact-export-review-1',
    runId: 'run-1',
    projectId: 'project-1',
    sourceTaskId: null,
    artifactType: 'export_review',
    artifactKey: 'export-review-artifact',
    parentArtifactId: null,
    status: 'failed_evaluation',
    version: 1,
    title: 'PDF Export Review',
    summary: review.summary,
    jsonContent: review,
    markdownContent: null,
    tiptapContent: null,
    metadata: null,
    pageEstimate: 5,
    tokenCount: null,
    createdAt: '2026-03-31T20:00:00.000Z',
    updatedAt: '2026-03-31T20:00:00.000Z',
    evaluations: [],
  };
}

describe('ArtifactReviewPanel parity UI', () => {
  it('renders parity metrics and keeps parity findings separate from generic export findings', () => {
    const review = buildReview();
    const artifact = buildArtifact(review);

    useGenerationStore.setState({
      artifacts: [artifact],
      selectedArtifactId: artifact.id,
      artifactDetail: artifact,
      evaluations: [],
      fetchArtifacts: vi.fn().mockResolvedValue(undefined),
      fetchEvaluations: vi.fn().mockResolvedValue(undefined),
      fetchArtifactDetail: vi.fn().mockResolvedValue(undefined),
      selectArtifact: vi.fn(),
    });

    renderWithProviders(<ArtifactReviewPanel projectId="project-1" runId="run-1" />);

    expect(screen.getByText('Text layout parity')).toBeInTheDocument();
    expect(screen.getByText('Mode: pretext')).toBeInTheDocument();
    expect(screen.getByText('Pages: 6 / 5')).toBeInTheDocument();
    expect(screen.getByText('Height delta: +42 px')).toBeInTheDocument();
    expect(screen.getByText('Text layout parity findings')).toBeInTheDocument();
    expect(screen.getByText('Grouped region: intro tail panel 1')).toBeInTheDocument();
    expect(screen.getByText(/The final page is visually sparse\./)).toBeInTheDocument();
    expect(screen.queryByText('No export-review findings.')).not.toBeInTheDocument();
  });
});
