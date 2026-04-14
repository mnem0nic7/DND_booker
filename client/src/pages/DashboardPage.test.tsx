import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ConsoleAgent, GenerationRun, InterviewSession } from '@dnd-booker/shared';
import DashboardPage from './DashboardPage';
import { renderWithProviders } from '../test/render';

const fetchProjects = vi.fn();
const logout = vi.fn();

const baseProject = {
  id: 'project-1',
  title: 'Underdark Afterdark',
  description: 'A one-shot in the deep roads.',
  type: 'one_shot',
  status: 'draft',
  createdAt: '2026-04-14T12:00:00.000Z',
  updatedAt: '2026-04-14T12:00:00.000Z',
  settings: {},
  content: null,
};

const baseAgents: ConsoleAgent[] = [
  {
    id: 'interviewer',
    name: 'The Interviewer',
    role: 'Brief & Intake',
    iconKey: 'radio',
    status: 'working',
    currentTask: 'Collecting campaign requirements and clarifying constraints.',
    progress: 25,
    queue: ['Collect missing constraints', 'Lock the structured brief'],
    lastPing: 'just now',
  },
  {
    id: 'forgemaster',
    name: 'The Forgemaster',
    role: 'Orchestrator',
    iconKey: 'hammer',
    status: 'waiting',
    currentTask: 'Waiting for the interview brief to lock.',
    progress: 0,
    queue: ['Coordinate the autonomous run'],
    lastPing: 'just now',
  },
];

const mockV1Client = vi.hoisted(() => ({
  console: {
    listConsoleAgents: vi.fn(),
    sendConsoleMessage: vi.fn(),
  },
  interviews: {
    getLatestInterviewSession: vi.fn(),
    createInterviewSession: vi.fn(),
    appendInterviewMessage: vi.fn(),
    lockInterviewSession: vi.fn(),
  },
  generationRuns: {
    listGenerationRuns: vi.fn(),
    createGenerationRun: vi.fn(),
  },
}));

vi.mock('../lib/api', () => ({
  v1Client: mockV1Client,
}));

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => ({
    user: { displayName: 'Operator' },
    logout,
  }),
}));

vi.mock('../stores/projectStore', () => ({
  useProjectStore: () => ({
    projects: [baseProject],
    isLoading: false,
    fetchError: null,
    fetchProjects,
  }),
}));

vi.mock('../components/projects/CreateProjectModal', () => ({
  default: () => null,
}));

function createInterviewSession(input: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id: 'session-1',
    projectId: 'project-1',
    userId: 'user-1',
    status: 'collecting',
    turns: [],
    briefDraft: null,
    lockedBrief: null,
    missingFields: [],
    maxUserTurns: 8,
    createdAt: '2026-04-14T12:00:00.000Z',
    updatedAt: '2026-04-14T12:00:00.000Z',
    lockedAt: null,
    ...input,
  };
}

function createGenerationRun(input: Partial<GenerationRun> = {}): GenerationRun {
  return {
    id: 'run-1',
    projectId: 'project-1',
    userId: 'user-1',
    mode: 'one_shot',
    quality: 'quick',
    status: 'queued',
    currentStage: 'queued',
    inputPrompt: 'Underdark one-shot',
    inputParameters: {
      interviewSessionId: 'session-1',
      qualityBudgetLane: 'balanced',
      interviewBrief: createInterviewSession({
        briefDraft: {
          title: 'Underdark Afterdark',
          summary: 'A one-shot in the deep roads.',
          generationMode: 'one_shot',
          concept: 'Delve the deep roads.',
          theme: 'underdark intrigue',
          tone: 'tense mystery',
          levelRange: { min: 4, max: 5 },
          scope: 'compact one-shot',
          partyAssumptions: 'A standard four-character party.',
          desiredComplexity: 'balanced',
          qualityBudgetLane: 'balanced',
          mustHaveElements: ['fungal court'],
          specialConstraints: ['SRD-safe'],
          settings: {
            includeHandouts: true,
            includeMaps: true,
            strict5e: true,
          },
        },
      }).briefDraft!,
      autonomousFlowVersion: 'agentic_v1',
    },
    progressPercent: 5,
    estimatedPages: null,
    estimatedTokens: null,
    estimatedCost: null,
    actualTokens: 0,
    actualCost: 0,
    failureReason: null,
    agentStage: 'interview_locked',
    criticCycle: 0,
    qualityBudgetLane: 'balanced',
    routedRewriteCounts: { writer: 0, dndExpert: 0, layoutExpert: 0, artist: 0 },
    imageGenerationStatus: 'not_requested',
    finalEditorialStatus: 'pending',
    graphThreadId: null,
    graphCheckpointKey: null,
    graphStateJson: null,
    resumeToken: null,
    createdAt: '2026-04-14T12:00:00.000Z',
    updatedAt: '2026-04-14T12:00:00.000Z',
    startedAt: null,
    completedAt: null,
    ...input,
  };
}

describe('DashboardPage interviewer flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockV1Client.console.listConsoleAgents.mockResolvedValue(baseAgents);
    mockV1Client.interviews.getLatestInterviewSession.mockResolvedValue(null);
    mockV1Client.generationRuns.listGenerationRuns.mockResolvedValue([]);
  });

  it('creates a real interview session from the interviewer chat lane', async () => {
    const user = userEvent.setup();
    const collectingSession = createInterviewSession({
      turns: [
        {
          id: 'turn-user-1',
          role: 'user',
          content: 'I want to create a one-shot',
          createdAt: '2026-04-14T12:00:00.000Z',
        },
        {
          id: 'turn-assistant-1',
          role: 'assistant',
          content: 'What level range and tone should I target?',
          createdAt: '2026-04-14T12:01:00.000Z',
        },
      ],
      briefDraft: {
        title: 'Underdark Afterdark',
        summary: 'A one-shot in the deep roads.',
        generationMode: 'one_shot',
        concept: 'A one-shot in the deep roads.',
        theme: 'underdark intrigue',
        tone: 'tense mystery',
        levelRange: null,
        scope: 'compact one-shot',
        partyAssumptions: 'A standard four-character party.',
        desiredComplexity: 'balanced',
        qualityBudgetLane: 'balanced',
        mustHaveElements: [],
        specialConstraints: [],
        settings: {
          includeHandouts: true,
          includeMaps: true,
          strict5e: true,
        },
      },
      missingFields: ['level range', 'quality budget lane'],
    });

    mockV1Client.interviews.createInterviewSession.mockResolvedValue(collectingSession);
    mockV1Client.interviews.getLatestInterviewSession
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(collectingSession);

    renderWithProviders(<DashboardPage />);

    await waitFor(() => {
      expect(mockV1Client.console.listConsoleAgents).toHaveBeenCalledWith({ projectId: 'project-1' });
    });

    await user.click(screen.getByRole('button', { name: /The Interviewer/i }));
    await user.type(screen.getByPlaceholderText(/Tell the interviewer/i), 'I want to create a one-shot');
    await user.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => {
      expect(mockV1Client.interviews.createInterviewSession).toHaveBeenCalledWith(
        { projectId: 'project-1' },
        { initialPrompt: 'I want to create a one-shot' },
      );
    });

    expect(await screen.findByText('What level range and tone should I target?')).toBeInTheDocument();
    expect(screen.getByTestId('interview-meta')).toHaveTextContent('Status: collecting');
    expect(screen.getByTestId('interview-meta')).toHaveTextContent('Missing: level range, quality budget lane');
  });

  it('locks the brief and launches a mission from the interviewer pane', async () => {
    const user = userEvent.setup();
    const readySession = createInterviewSession({
      status: 'ready_to_lock',
      briefDraft: {
        title: 'Underdark Afterdark',
        summary: 'A one-shot in the deep roads.',
        generationMode: 'one_shot',
        concept: 'A one-shot in the deep roads.',
        theme: 'underdark intrigue',
        tone: 'tense mystery',
        levelRange: { min: 4, max: 5 },
        scope: 'compact one-shot',
        partyAssumptions: 'A standard four-character party.',
        desiredComplexity: 'balanced',
        qualityBudgetLane: 'balanced',
        mustHaveElements: ['fungal court'],
        specialConstraints: ['SRD-safe'],
        settings: {
          includeHandouts: true,
          includeMaps: true,
          strict5e: true,
        },
      },
      missingFields: [],
    });
    const lockedSession = createInterviewSession({
      ...readySession,
      status: 'locked',
      lockedBrief: readySession.briefDraft,
      lockedAt: '2026-04-14T12:05:00.000Z',
    });
    const run = createGenerationRun();

    mockV1Client.interviews.getLatestInterviewSession
      .mockResolvedValueOnce(readySession)
      .mockResolvedValueOnce(lockedSession)
      .mockResolvedValueOnce(lockedSession);
    mockV1Client.interviews.lockInterviewSession.mockResolvedValue(lockedSession);
    mockV1Client.generationRuns.createGenerationRun.mockResolvedValue(run);
    mockV1Client.generationRuns.listGenerationRuns
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([run]);

    renderWithProviders(<DashboardPage />);

    await user.click(await screen.findByRole('button', { name: /The Interviewer/i }));
    await user.click(screen.getByRole('button', { name: 'Lock Brief' }));

    await waitFor(() => {
      expect(mockV1Client.interviews.lockInterviewSession).toHaveBeenCalledWith(
        { projectId: 'project-1', sessionId: 'session-1' },
        {},
      );
    });

    await user.click(await screen.findByRole('button', { name: 'Launch Mission' }));

    await waitFor(() => {
      expect(mockV1Client.generationRuns.createGenerationRun).toHaveBeenCalledWith(
        { projectId: 'project-1' },
        { interviewSessionId: 'session-1' },
      );
    });

    expect(await screen.findByRole('button', { name: 'Mission Launched' })).toBeDisabled();
  });
});
