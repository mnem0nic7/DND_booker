import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentContent, LayoutDocumentV2 } from '@dnd-booker/shared';
import { EditorLayout } from './EditorLayout';
import { renderWithProviders } from '../../test/render';

const mockOpenExportDialog = vi.hoisted(() => vi.fn());
const mockSetSettingsModalOpen = vi.hoisted(() => vi.fn());
const mockEditor = vi.hoisted(() => ({
  state: {
    selection: { $anchor: { pos: 0 } },
    doc: {
      forEach: () => undefined,
      nodesBetween: () => undefined,
    },
  },
  commands: {
    focus: vi.fn(),
    setNodeSelection: vi.fn(),
  },
  on: vi.fn(),
  off: vi.fn(),
  getJSON: () => ({ type: 'doc', content: [] }),
}));
const mockUseMeasuredLayoutDocument = vi.hoisted(() => vi.fn(() => ({
  measurementHtml: '',
  renderedHtml: '',
  measurementRef: { current: null },
  layoutSnapshot: null,
  pageModel: null,
  measurements: [],
  pageMetrics: null,
  textLayoutTelemetry: null,
  shadowTelemetry: null,
})));

vi.mock('@tiptap/react', () => ({
  useEditor: () => mockEditor,
  EditorContent: () => null,
}));

vi.mock('../../lib/buildEditorExtensions', () => ({
  buildEditorExtensions: () => [],
}));

vi.mock('../../lib/useMeasuredLayoutDocument', () => ({
  useMeasuredLayoutDocument: mockUseMeasuredLayoutDocument,
}));

vi.mock('../../stores/themeStore', () => ({
  useThemeStore: (selector: (state: { currentTheme: string }) => unknown) => selector({ currentTheme: 'gilded-folio' }),
}));

vi.mock('../../stores/exportStore', () => ({
  useExportStore: (selector: (state: { openDialog: () => void }) => unknown) => selector({ openDialog: mockOpenExportDialog }),
}));

vi.mock('../../stores/aiStore', () => ({
  useAiStore: (selector: (state: { setSettingsModalOpen: (open: boolean) => void }) => unknown) => selector({ setSettingsModalOpen: mockSetSettingsModalOpen }),
}));

vi.mock('./Toolbar', () => ({ Toolbar: () => <div data-testid="toolbar" /> }));
vi.mock('./FloatingBlockPicker', () => ({ FloatingBlockPicker: () => null }));
vi.mock('./ExportDialog', () => ({ ExportDialog: () => null }));
vi.mock('./ProjectAssetGalleryDialog', () => ({ ProjectAssetGalleryDialog: () => null }));
vi.mock('./RenderedDocumentCanvas', () => ({ RenderedDocumentCanvas: () => <div data-testid="rendered-canvas" /> }));
vi.mock('./SelectedBlockEditorPanel', () => ({ SelectedBlockEditorPanel: () => null }));
vi.mock('../preview/PreviewPanel', () => ({ PreviewPanel: () => null }));
vi.mock('../ai/AiSettingsModal', () => ({ AiSettingsModal: () => null }));
vi.mock('../ai/AiChatPanel', () => ({ AiChatPanel: () => null }));
vi.mock('../ai/AutonomousGenerationDialog', () => ({ AutonomousGenerationDialog: () => null }));
vi.mock('../ai/AutonomousAgentDialog', () => ({ AutonomousAgentDialog: () => null }));

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const emptyDoc: DocumentContent = { type: 'doc', content: [] };
const persistedSnapshot: LayoutDocumentV2 = {
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
    documentTitle: 'Hydrated Chapter',
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

describe('EditorLayout fallback banner', () => {
  beforeEach(() => {
    mockUseMeasuredLayoutDocument.mockClear();
  });

  it('shows the banner only when fallback scopes are active', () => {
    const { rerender } = renderWithProviders(
      <EditorLayout
        projectId="project-1"
        content={emptyDoc}
        textLayoutFallbackScopeCount={0}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.queryByText('Legacy fallback is active for this document')).not.toBeInTheDocument();

    rerender(
      <EditorLayout
        projectId="project-1"
        content={emptyDoc}
        textLayoutFallbackScopeCount={2}
        onUpdate={vi.fn()}
      />,
    );

    expect(screen.getByText('Legacy fallback is active for this document')).toBeInTheDocument();
    expect(screen.getByText(/2 scoped fallbacks are stabilizing preview, export, and server-side pagination/)).toBeInTheDocument();
  });

  it('disables and relabels the clear button while fallbacks are being cleared', async () => {
    const deferred = createDeferred<void>();
    const onClearTextLayoutFallbacks = vi.fn(() => deferred.promise);
    const user = userEvent.setup();

    renderWithProviders(
      <EditorLayout
        projectId="project-1"
        content={emptyDoc}
        textLayoutFallbackScopeCount={1}
        onClearTextLayoutFallbacks={onClearTextLayoutFallbacks}
        onUpdate={vi.fn()}
      />,
    );

    const button = screen.getByRole('button', { name: 'Clear fallback' });
    await user.click(button);

    expect(onClearTextLayoutFallbacks).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Clearing...' })).toBeDisabled();

    deferred.resolve();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Clear fallback' })).toBeEnabled();
    });
  });

  it('hydrates the paginated layout runtime from the persisted standard-pdf snapshot', () => {
    renderWithProviders(
      <EditorLayout
        projectId="project-1"
        content={emptyDoc}
        layoutSnapshot={persistedSnapshot}
        documentKind="chapter"
        documentTitle="Hydrated Chapter"
        onUpdate={vi.fn()}
      />,
    );

    expect(mockUseMeasuredLayoutDocument).toHaveBeenCalledWith(expect.objectContaining({
      initialContent: emptyDoc,
      initialLayoutSnapshot: persistedSnapshot,
      preset: 'standard_pdf',
      documentKind: 'chapter',
      documentTitle: 'Hydrated Chapter',
    }));
  });
});
