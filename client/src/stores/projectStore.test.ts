import { act } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import type { LayoutDocumentV2, ProjectSettings } from '@dnd-booker/shared';
import { useProjectStore, type Project } from './projectStore';
import { server } from '../test/msw/server';

function buildSettings(): ProjectSettings {
  return {
    pageSize: 'letter',
    margins: { top: 1, right: 1, bottom: 1, left: 1 },
    columns: 1,
    theme: 'gilded-folio',
    fonts: { heading: 'Cinzel', body: 'Crimson Text' },
    textLayoutFallbacks: {
      'doc-1': { scopeIds: ['unit:read-aloud-box-1', 'group:utility-table-1'] },
      'doc-2': { scopeIds: ['group:encounter-packet-1'] },
    },
  };
}

function buildProject(settings: ProjectSettings): Project {
  return {
    id: 'project-1',
    title: 'Parity Project',
    description: 'Test project',
    type: 'campaign',
    status: 'draft',
    coverImageUrl: null,
    settings,
    createdAt: '2026-03-31T20:00:00.000Z',
    updatedAt: '2026-03-31T20:00:00.000Z',
  };
}

function buildLayoutSnapshot(): LayoutDocumentV2 {
  return {
    version: 2,
    preset: 'standard_pdf',
    sectionRecipe: null,
    columnBalanceTarget: 'balanced',
    layoutPlan: null,
    measureProfile: {
      preset: 'standard_pdf',
      frame: {
        pageWidthPx: 816,
        pageHeightPx: 1056,
        contentWidthPx: 696,
        contentHeightPx: 880,
        columnWidthPx: 339,
        columnCount: 2,
        columnGapPx: 18,
      },
      theme: 'gilded-folio',
      documentKind: 'chapter',
      documentTitle: 'Chapter 1',
      respectManualPageBreaks: true,
      measurementMode: 'deterministic',
      fallbackScopeIds: [],
    },
    pages: [],
    fragments: [],
    anchors: [],
    diagnostics: [],
    metrics: {
      fragmentCount: 0,
      heroFragmentCount: 0,
      groupedFragmentCount: 0,
      keepTogetherCount: 0,
      pageCount: 0,
    },
    generatedAt: '2026-04-10T12:00:00.000Z',
  };
}

describe('projectStore.clearDocumentTextLayoutFallbacks', () => {
  it('removes only the targeted document fallback entry and preserves unrelated settings', async () => {
    const initialSettings = buildSettings();
    const project = buildProject(initialSettings);
    let requestBody: unknown = null;

    server.use(
      http.patch('/api/v1/projects/:projectId', async ({ request, params }) => {
        requestBody = await request.json();
        const payload = requestBody as { settings?: Partial<ProjectSettings> };
        return HttpResponse.json({
          ...project,
          id: String(params.projectId),
          settings: {
            ...initialSettings,
            ...payload.settings,
          },
        });
      }),
    );

    useProjectStore.setState({
      currentProject: project,
      projects: [project],
      isSaving: false,
      hasPendingChanges: false,
      saveError: null,
    });

    await act(async () => {
      await useProjectStore.getState().clearDocumentTextLayoutFallbacks('doc-1');
    });

    expect(requestBody).toEqual({
      settings: {
        textLayoutFallbacks: {
          'doc-2': { scopeIds: ['group:encounter-packet-1'] },
        },
      },
    });

    const nextProject = useProjectStore.getState().currentProject;
    expect(nextProject?.settings.theme).toBe('gilded-folio');
    expect(nextProject?.settings.pageSize).toBe('letter');
    expect(nextProject?.settings.textLayoutFallbacks).toEqual({
      'doc-2': { scopeIds: ['group:encounter-packet-1'] },
    });
  });
});

describe('projectStore.updateDocumentLayoutPlan', () => {
  it('saves document layout plans through api/v1 and keeps the active document in sync', async () => {
    const project = buildProject(buildSettings());
    const nextLayoutPlan = {
      version: 1 as const,
      sectionRecipe: 'chapter_hero_split' as const,
      columnBalanceTarget: 'balanced' as const,
      blocks: [
        {
          nodeId: 'hero-node',
          presentationOrder: 0,
          span: 'both_columns' as const,
          placement: 'hero_top' as const,
          groupId: null,
          keepTogether: true,
          allowWrapBelow: false,
        },
      ],
    };

    server.use(
      http.patch('/api/v1/projects/:projectId/documents/:docId/layout', () => HttpResponse.json({
        schemaVersion: 1,
        documentId: 'doc-1',
        projectId: project.id,
        kind: 'chapter',
        title: 'Chapter 1',
        slug: 'chapter-1',
        sortOrder: 0,
        targetPageCount: null,
        layoutPlan: nextLayoutPlan,
        status: 'edited',
        sourceArtifactId: null,
        canonicalDocJson: { type: 'doc', content: [{ type: 'paragraph' }] },
        editorProjectionJson: { type: 'doc', content: [{ type: 'paragraph' }] },
        typstSource: '= Chapter 1',
        canonicalVersion: 1,
        editorProjectionVersion: 1,
        typstVersion: 1,
        updatedAt: '2026-03-31T20:05:00.000Z',
      })),
    );

    useProjectStore.setState({
      currentProject: project,
      projects: [project],
      documents: [{
        id: 'doc-1',
        projectId: project.id,
        runId: null,
        kind: 'chapter',
        title: 'Chapter 1',
        slug: 'chapter-1',
        sortOrder: 0,
        targetPageCount: null,
        outlineJson: null,
        layoutPlan: null,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        canonicalDocJson: null,
        editorProjectionJson: null,
        typstSource: null,
        canonicalVersion: 1,
        editorProjectionVersion: 1,
        typstVersion: 1,
        status: 'draft',
        sourceArtifactId: null,
        createdAt: '2026-03-31T20:00:00.000Z',
        updatedAt: '2026-03-31T20:00:00.000Z',
      }],
      activeDocument: {
        id: 'doc-1',
        projectId: project.id,
        runId: null,
        kind: 'chapter',
        title: 'Chapter 1',
        slug: 'chapter-1',
        sortOrder: 0,
        targetPageCount: null,
        outlineJson: null,
        layoutPlan: null,
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        canonicalDocJson: null,
        editorProjectionJson: null,
        typstSource: null,
        canonicalVersion: 1,
        editorProjectionVersion: 1,
        typstVersion: 1,
        status: 'draft',
        sourceArtifactId: null,
        createdAt: '2026-03-31T20:00:00.000Z',
        updatedAt: '2026-03-31T20:00:00.000Z',
      },
      isSaving: false,
      hasPendingChanges: false,
      saveError: null,
    });

    await act(async () => {
      await useProjectStore.getState().updateDocumentLayoutPlan(nextLayoutPlan);
    });

    expect(useProjectStore.getState().activeDocument?.layoutPlan).toEqual(nextLayoutPlan);
    expect(useProjectStore.getState().documents[0]?.layoutPlan).toEqual(nextLayoutPlan);
  });
});

describe('projectStore.updateDocumentContent', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('saves layout snapshots alongside document content through api/v1', async () => {
    const project = buildProject(buildSettings());
    const nextSnapshot = buildLayoutSnapshot();
    const nextContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', attrs: { nodeId: 'p-1' }, content: [{ type: 'text', text: 'Updated text' }] },
      ],
    };
    let requestBody: unknown = null;

    server.use(
      http.patch('/api/v1/projects/:projectId/documents/:docId', async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json({
          schemaVersion: 1,
          documentId: 'doc-1',
          projectId: project.id,
          kind: 'chapter',
          title: 'Chapter 1',
          slug: 'chapter-1',
          sortOrder: 0,
          targetPageCount: null,
          layoutPlan: null,
          status: 'edited',
          sourceArtifactId: null,
          canonicalDocJson: nextContent,
          editorProjectionJson: nextContent,
          typstSource: '= Chapter 1',
          layoutSnapshotJson: nextSnapshot,
          layoutEngineVersion: 2,
          layoutSnapshotUpdatedAt: '2026-04-10T12:00:01.000Z',
          canonicalVersion: 1,
          editorProjectionVersion: 2,
          typstVersion: 1,
          updatedAt: '2026-04-10T12:00:01.000Z',
        });
      }),
    );

    useProjectStore.setState({
      currentProject: project,
      projects: [project],
      documents: [{
        id: 'doc-1',
        projectId: project.id,
        runId: null,
        kind: 'chapter',
        title: 'Chapter 1',
        slug: 'chapter-1',
        sortOrder: 0,
        targetPageCount: null,
        outlineJson: null,
        layoutPlan: null,
        content: { type: 'doc', content: [] },
        canonicalDocJson: null,
        editorProjectionJson: null,
        typstSource: null,
        layoutSnapshotJson: null,
        layoutEngineVersion: null,
        layoutSnapshotUpdatedAt: null,
        canonicalVersion: 1,
        editorProjectionVersion: 1,
        typstVersion: 1,
        status: 'draft',
        sourceArtifactId: null,
        createdAt: '2026-03-31T20:00:00.000Z',
        updatedAt: '2026-03-31T20:00:00.000Z',
      }],
      activeDocument: {
        id: 'doc-1',
        projectId: project.id,
        runId: null,
        kind: 'chapter',
        title: 'Chapter 1',
        slug: 'chapter-1',
        sortOrder: 0,
        targetPageCount: null,
        outlineJson: null,
        layoutPlan: null,
        content: { type: 'doc', content: [] },
        canonicalDocJson: null,
        editorProjectionJson: null,
        typstSource: null,
        layoutSnapshotJson: null,
        layoutEngineVersion: null,
        layoutSnapshotUpdatedAt: null,
        canonicalVersion: 1,
        editorProjectionVersion: 1,
        typstVersion: 1,
        status: 'draft',
        sourceArtifactId: null,
        createdAt: '2026-03-31T20:00:00.000Z',
        updatedAt: '2026-03-31T20:00:00.000Z',
      },
      isSaving: false,
      hasPendingChanges: false,
      saveError: null,
    });

    act(() => {
      useProjectStore.getState().updateDocumentContent(nextContent, { layoutSnapshot: nextSnapshot });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(requestBody).toEqual({
      editorProjectionJson: nextContent,
      layoutSnapshotJson: nextSnapshot,
      expectedUpdatedAt: '2026-03-31T20:00:00.000Z',
    });
    expect(useProjectStore.getState().activeDocument?.layoutSnapshotJson).toEqual(nextSnapshot);
    expect(useProjectStore.getState().activeDocument?.layoutEngineVersion).toBe(2);
  });
});
