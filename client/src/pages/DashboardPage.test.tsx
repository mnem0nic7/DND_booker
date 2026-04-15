import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useProjectStore } from '../stores/projectStore';
import { useAuthStore } from '../stores/authStore';
import DashboardPage from './DashboardPage';
import { renderWithProviders } from '../test/render';
import type { Project } from '../stores/projectStore';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    title: 'Default Project',
    description: '',
    type: 'one_shot',
    status: 'draft',
    coverImageUrl: null,
    settings: {
      pageSize: 'letter',
      margins: { top: 1, right: 1, bottom: 1, left: 1 },
      columns: 1,
      theme: 'gilded-folio',
      fonts: { heading: 'Cinzel', body: 'Crimson Text' },
      textLayoutFallbacks: {},
    },
    createdAt: '2026-03-01T00:00:00.000Z',
    updatedAt: '2026-03-01T00:00:00.000Z',
    ...overrides,
  };
}

const shadowveil = makeProject({
  id: 'proj-shadowveil',
  title: 'Shadowveil',
  updatedAt: '2026-04-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
});

const dungeon = makeProject({
  id: 'proj-dungeon',
  title: 'Dungeon',
  updatedAt: '2026-03-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(() => {
  useProjectStore.setState({ projects: [shadowveil, dungeon], isLoading: false, fetchError: null });
  useAuthStore.setState({ user: null, isLoading: false });
});

afterEach(() => {
  useProjectStore.setState({ projects: [], isLoading: false, fetchError: null });
});

describe('DashboardPage', () => {
  it('renders the most recently updated project tab as active by default', async () => {
    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Shadowveil' })).toBeInTheDocument();
    });

    const shadowveilTab = screen.getByRole('button', { name: 'Shadowveil' });
    const dungeonTab = screen.getByRole('button', { name: 'Dungeon' });

    expect(shadowveilTab.className).toContain('forge-topbar__project--active');
    expect(dungeonTab.className).not.toContain('forge-topbar__project--active');
  });

  it('switches the active tab when a project is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dungeon' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Dungeon' }));

    const dungeonTab = screen.getByRole('button', { name: 'Dungeon' });
    const shadowveilTab = screen.getByRole('button', { name: 'Shadowveil' });

    expect(dungeonTab.className).toContain('forge-topbar__project--active');
    expect(shadowveilTab.className).not.toContain('forge-topbar__project--active');
  });
});
