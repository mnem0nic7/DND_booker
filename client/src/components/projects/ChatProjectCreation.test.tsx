import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw/server';
import { renderWithProviders } from '../../test/render';
import { ChatProjectCreation } from './ChatProjectCreation';
import type { InterviewSession, ProjectSummary } from '@dnd-booker/shared';

function buildProjectSummary(overrides: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'proj-abc',
    userId: 'user-1',
    title: 'New Project',
    description: '',
    type: 'campaign',
    status: 'draft',
    coverImageUrl: null,
    settings: {
      pageSize: 'letter',
      margins: { top: 1, right: 1, bottom: 1, left: 1 },
      columns: 1,
      theme: 'classic-parchment',
      fonts: { heading: 'serif', body: 'serif' },
      textLayoutFallbacks: {},
    },
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    ...overrides,
  };
}

function buildSession(overrides: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: 'sess-abc',
    projectId: 'proj-abc',
    userId: 'user-1',
    status: 'collecting',
    turns: [],
    briefDraft: null,
    lockedBrief: null,
    missingFields: [],
    maxUserTurns: 20,
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
    lockedAt: null,
    ...overrides,
  };
}

describe('ChatProjectCreation', () => {
  it('renders the welcome message on mount', () => {
    const onCreated = vi.fn();
    renderWithProviders(<ChatProjectCreation onCreated={onCreated} />);

    expect(
      screen.getByText(
        "Tell me about the D&D project you want to create. What kind of adventure, supplement, or sourcebook do you have in mind?",
      ),
    ).toBeInTheDocument();
  });

  it('renders the composer textarea', () => {
    const onCreated = vi.fn();
    renderWithProviders(<ChatProjectCreation onCreated={onCreated} />);

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Describe your project...')).toBeInTheDocument();
  });

  it('calls project creation, session creation, and message APIs in sequence then calls onCreated', async () => {
    const onCreated = vi.fn();
    const projectId = 'proj-xyz';
    const sessionId = 'sess-xyz';

    const projectCreated = vi.fn();
    const sessionCreated = vi.fn();
    const messageSent = vi.fn();

    server.use(
      http.post('/api/v1/projects', async () => {
        projectCreated();
        return HttpResponse.json(buildProjectSummary({ id: projectId }));
      }),
      http.post(`/api/v1/projects/${projectId}/interview/sessions`, async () => {
        sessionCreated();
        return HttpResponse.json(buildSession({ id: sessionId, projectId }));
      }),
      http.post(
        `/api/v1/projects/${projectId}/interview/sessions/${sessionId}/messages`,
        async () => {
          messageSent();
          return HttpResponse.json(
            buildSession({
              id: sessionId,
              projectId,
              turns: [
                {
                  id: 'turn-1',
                  role: 'assistant',
                  content: 'Great idea! Tell me more.',
                  createdAt: '2026-04-15T00:00:00.000Z',
                },
              ],
            }),
          );
        },
      ),
    );

    renderWithProviders(<ChatProjectCreation onCreated={onCreated} />);

    await userEvent.type(screen.getByRole('textbox'), 'A dark fantasy campaign');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(projectCreated).toHaveBeenCalledOnce();
    });
    expect(sessionCreated).toHaveBeenCalledOnce();
    expect(messageSent).toHaveBeenCalledOnce();
  });

  it('calls onCreated with the project id after message is sent', async () => {
    const onCreated = vi.fn();
    const projectId = 'proj-created';
    const sessionId = 'sess-created';

    server.use(
      http.post('/api/v1/projects', async () => {
        return HttpResponse.json(buildProjectSummary({ id: projectId }));
      }),
      http.post(`/api/v1/projects/${projectId}/interview/sessions`, async () => {
        return HttpResponse.json(buildSession({ id: sessionId, projectId }));
      }),
      http.post(
        `/api/v1/projects/${projectId}/interview/sessions/${sessionId}/messages`,
        async () => {
          return HttpResponse.json(
            buildSession({
              id: sessionId,
              projectId,
              turns: [
                {
                  id: 'turn-1',
                  role: 'assistant',
                  content: 'Sounds amazing!',
                  createdAt: '2026-04-15T00:00:00.000Z',
                },
              ],
            }),
          );
        },
      ),
    );

    renderWithProviders(<ChatProjectCreation onCreated={onCreated} />);

    await userEvent.type(screen.getByRole('textbox'), 'A pirate adventure');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith({ id: projectId });
    });
  });

  it('disables the composer while sending', async () => {
    const onCreated = vi.fn();

    // Use a never-resolving handler to hold the request open
    let resolveProject!: (value: Response) => void;
    const projectPromise = new Promise<Response>((res) => {
      resolveProject = res;
    });

    server.use(
      http.post('/api/v1/projects', () => projectPromise),
    );

    renderWithProviders(<ChatProjectCreation onCreated={onCreated} />);

    await userEvent.type(screen.getByRole('textbox'), 'An epic quest');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    // Clean up the pending promise
    resolveProject(HttpResponse.json(buildProjectSummary()) as unknown as Response);
  });
});
