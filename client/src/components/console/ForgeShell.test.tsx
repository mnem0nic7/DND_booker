import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/msw/server';
import { renderWithProviders } from '../../test/render';
import { ForgeShell } from './ForgeShell';
import type { ConsoleAgent, InterviewSession } from '@dnd-booker/shared';

function buildAgent(id: string, name: string): ConsoleAgent {
  return {
    id,
    name,
    role: 'specialist',
    iconKey: id,
    status: 'idle',
    currentTask: null,
    progress: 0,
    queue: [],
    lastPing: '2026-04-15T00:00:00.000Z',
  };
}

function buildSession(overrides: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: 'sess-default',
    projectId: 'proj-1',
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

describe('ForgeShell', () => {
  it('renders agent names fetched from the API', async () => {
    server.use(
      http.get('/api/v1/projects/proj-1/console/agents', () =>
        HttpResponse.json([buildAgent('writer', 'Writer'), buildAgent('critic', 'Critic')]),
      ),
    );

    renderWithProviders(<ForgeShell projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('Writer')).toBeInTheDocument();
    });
    expect(screen.getByText('Critic')).toBeInTheDocument();
  });

  it('shows the interviewer greeting message from the interview session', async () => {
    server.use(
      http.get('/api/v1/projects/proj-1/interview/sessions/latest', () =>
        HttpResponse.json(
          buildSession({
            turns: [
              {
                id: 'turn-1',
                role: 'assistant',
                content: 'What are you building today?',
                createdAt: '2026-04-15T00:00:00.000Z',
              },
            ],
          }),
        ),
      ),
    );

    renderWithProviders(<ForgeShell projectId="proj-1" />);

    await waitFor(() => {
      expect(screen.getByText('What are you building today?')).toBeInTheDocument();
    });
  });

  it('sends a message to the interview API when interviewer is selected', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.get('/api/v1/projects/proj-1/interview/sessions/latest', () =>
        HttpResponse.json(buildSession()),
      ),
      http.post('/api/v1/projects/proj-1/interview/sessions/:sessionId/messages', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json(buildSession());
      }),
    );

    renderWithProviders(<ForgeShell projectId="proj-1" />);

    // Wait for initial load
    await waitFor(() => {
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    await userEvent.type(screen.getByRole('textbox'), 'A gothic horror campaign');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ content: 'A gothic horror campaign' });
    });
  });

  it('sends a message to the console chat API when a non-interviewer agent is selected', async () => {
    let capturedBody: unknown = null;

    server.use(
      http.get('/api/v1/projects/proj-1/console/agents', () =>
        HttpResponse.json([buildAgent('writer', 'Writer')]),
      ),
      http.post('/api/v1/projects/proj-1/console/chat', async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({ replies: [] });
      }),
    );

    renderWithProviders(<ForgeShell projectId="proj-1" />);

    // Wait for the Writer card to appear then click it
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /writer/i })).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /writer/i }));
    await userEvent.type(screen.getByRole('textbox'), 'Add more traps');
    await userEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(capturedBody).toMatchObject({ agentId: 'writer', message: 'Add more traps' });
    });
  });
});
