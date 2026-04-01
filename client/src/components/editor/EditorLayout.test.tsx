import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DocumentContent } from '@dnd-booker/shared';
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

vi.mock('@tiptap/react', () => ({
  useEditor: () => mockEditor,
  EditorContent: () => null,
}));

vi.mock('../../lib/buildEditorExtensions', () => ({
  buildEditorExtensions: () => [],
}));

vi.mock('../../lib/useMeasuredLayoutDocument', () => ({
  useMeasuredLayoutDocument: () => ({
    pageMetrics: null,
    pages: [],
    fragments: [],
  }),
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

describe('EditorLayout fallback banner', () => {
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
});
