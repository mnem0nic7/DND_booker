import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Circle, LogOut, Plus, Signal, Users } from 'lucide-react';
import type { ConsoleAgent, GenerationRun, InterviewSession } from '@dnd-booker/shared';
import { v1Client } from '../lib/api';
import {
  buildConsoleAgentMessage,
  buildConsoleSystemMessage,
  buildInterviewThreadMessages,
  buildConsoleUserMessage,
  buildProjectWelcomeMessage,
  filterConsoleMessages,
  getActiveConsoleAgentCount,
  type ConsoleChatTargetId,
  type ConsoleMessage,
} from '../lib/forgeConsole';
import { useAuthStore } from '../stores/authStore';
import { useProjectStore, type Project } from '../stores/projectStore';
import CreateProjectModal from '../components/projects/CreateProjectModal';
import { AgentCard } from '../components/console/AgentCard';
import { MessageList } from '../components/console/MessageList';
import { Composer } from '../components/console/Composer';
import '../styles/forge-console.css';

type ConnectionState = 'live' | 'reconnecting';

function sortProjects(projects: Project[]) {
  return [...projects].sort((left, right) => (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  ));
}

function getInterviewSessionRun(runs: GenerationRun[], sessionId: string | null) {
  if (!sessionId) return null;
  return runs.find((run) => {
    const inputParameters = run.inputParameters;
    return Boolean(
      inputParameters
      && typeof inputParameters === 'object'
      && 'interviewSessionId' in inputParameters
      && inputParameters.interviewSessionId === sessionId,
    );
  }) ?? null;
}

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const { projects, isLoading, fetchError, fetchProjects } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [agents, setAgents] = useState<ConsoleAgent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('live');
  const [selectedTargetsByProject, setSelectedTargetsByProject] = useState<Record<string, ConsoleChatTargetId>>({});
  const [messagesByProject, setMessagesByProject] = useState<Record<string, ConsoleMessage[]>>({});
  const [interviewsByProject, setInterviewsByProject] = useState<Record<string, InterviewSession | null>>({});
  const [runsByProject, setRunsByProject] = useState<Record<string, GenerationRun[]>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [lockingInterview, setLockingInterview] = useState(false);
  const [launchingMission, setLaunchingMission] = useState(false);
  const [startingInterview, setStartingInterview] = useState(false);
  const thinkingTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const sortedProjects = useMemo(() => sortProjects(projects), [projects]);

  useEffect(() => {
    if (sortedProjects.length === 0) {
      setSelectedProjectId(null);
      return;
    }

    if (!selectedProjectId || !sortedProjects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(sortedProjects[0]!.id);
    }
  }, [selectedProjectId, sortedProjects]);

  const selectedProject = useMemo(
    () => sortedProjects.find((project) => project.id === selectedProjectId) ?? null,
    [selectedProjectId, sortedProjects],
  );

  const selectedTargetId = selectedProjectId
    ? (selectedTargetsByProject[selectedProjectId] ?? 'forgemaster')
    : 'forgemaster';

  useEffect(() => {
    if (!selectedProject) return;
    setMessagesByProject((current) => {
      if (current[selectedProject.id]) return current;
      return {
        ...current,
        [selectedProject.id]: [buildProjectWelcomeMessage(selectedProject.title)],
      };
    });
  }, [selectedProject]);

  const loadProjectState = useCallback(async (projectId: string) => {
    try {
      const [nextAgents, interview, runs] = await Promise.all([
        v1Client.console.listConsoleAgents({ projectId }),
        v1Client.interviews.getLatestInterviewSession({ projectId }),
        v1Client.generationRuns.listGenerationRuns({ projectId }),
      ]);

      setAgents(nextAgents);
      setInterviewsByProject((current) => ({
        ...current,
        [projectId]: interview,
      }));
      setRunsByProject((current) => ({
        ...current,
        [projectId]: runs,
      }));
      setConnectionState('live');
    } catch {
      setConnectionState('reconnecting');
    }
  }, []);

  useEffect(() => {
    if (!selectedProjectId) {
      setAgents([]);
      return;
    }

    const projectId = selectedProjectId;
    setAgents([]);

    async function pollProjectState() {
      await loadProjectState(projectId);
    }

    void pollProjectState();
    const poller = window.setInterval(() => {
      void pollProjectState();
    }, 5_000);

    return () => {
      window.clearInterval(poller);
    };
  }, [loadProjectState, selectedProjectId]);

  useEffect(() => () => {
    if (thinkingTimeoutRef.current) {
      window.clearTimeout(thinkingTimeoutRef.current);
    }
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedTargetId) ?? null,
    [agents, selectedTargetId],
  );
  const selectedInterview = useMemo(
    () => selectedProjectId ? (interviewsByProject[selectedProjectId] ?? null) : null,
    [interviewsByProject, selectedProjectId],
  );
  const selectedProjectRuns = useMemo(
    () => selectedProjectId ? (runsByProject[selectedProjectId] ?? []) : [],
    [runsByProject, selectedProjectId],
  );
  const interviewRun = useMemo(
    () => getInterviewSessionRun(selectedProjectRuns, selectedInterview?.id ?? null),
    [selectedInterview?.id, selectedProjectRuns],
  );

  useEffect(() => {
    setDraft('');
  }, [selectedProjectId, selectedTargetId]);

  const baseMessages = messagesByProject[selectedProjectId ?? ''] ?? [];
  const visibleMessages = useMemo(
    () => selectedTargetId === 'interviewer'
      ? [
        ...baseMessages.filter((message) => message.kind === 'system' && (message.targetAgentId === null || message.targetAgentId === 'interviewer')),
        ...buildInterviewThreadMessages(selectedInterview),
      ]
      : filterConsoleMessages(baseMessages, selectedTargetId),
    [baseMessages, selectedInterview, selectedTargetId],
  );

  const activeAgentCount = useMemo(() => getActiveConsoleAgentCount(agents), [agents]);

  const chatTitle = selectedTargetId === 'broadcast'
    ? 'All Agents'
    : selectedTargetId === 'interviewer'
      ? 'The Interviewer'
      : selectedAgent?.name ?? 'The Forgemaster';
  const chatTask = selectedTargetId === 'broadcast'
    ? `${activeAgentCount} agents active in the hall`
    : selectedTargetId === 'interviewer'
      ? selectedAgent?.currentTask ?? (selectedInterview ? 'Gathering the brief.' : 'Ready to gather the brief.')
      : selectedAgent?.currentTask ?? 'Awaiting instruction.';
  const composerPlaceholder = selectedTargetId === 'broadcast'
    ? 'Address all agents in the hall...'
    : selectedTargetId === 'interviewer'
      ? selectedInterview?.status === 'locked'
        ? 'Start a new interview to revise the brief...'
        : 'Tell the interviewer what you want to create...'
      : `Send word to ${selectedAgent?.name ?? 'the selected agent'}...`;
  const thinkingLabel = sending
    ? selectedTargetId === 'broadcast'
      ? 'The hall is considering your command...'
      : selectedTargetId === 'interviewer'
        ? 'The interviewer is refining the brief...'
      : `${selectedAgent?.name ?? 'The agent'} is thinking...`
    : null;
  const interviewerUserTurnCount = selectedInterview?.turns.filter((turn) => turn.role === 'user').length ?? 0;
  const interviewerBudgetLane = selectedInterview?.lockedBrief?.qualityBudgetLane
    ?? selectedInterview?.briefDraft?.qualityBudgetLane
    ?? null;
  const interviewerComposerDisabled = !selectedProjectId || selectedInterview?.status === 'locked';

  function setSelectedTarget(targetId: ConsoleChatTargetId) {
    if (!selectedProjectId) return;
    setSelectedTargetsByProject((current) => ({
      ...current,
      [selectedProjectId]: targetId,
    }));
  }

  async function handleStartNewInterview() {
    if (!selectedProjectId || startingInterview) return;
    setStartingInterview(true);
    try {
      const session = await v1Client.interviews.createInterviewSession({ projectId: selectedProjectId }, {});
      setInterviewsByProject((current) => ({
        ...current,
        [selectedProjectId]: session,
      }));
      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []).filter((message) => message.kind === 'system' && message.targetAgentId === null),
        ],
      }));
      await loadProjectState(selectedProjectId);
    } catch {
      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          buildConsoleSystemMessage('Failed to start a new interview.', 'interviewer'),
        ],
      }));
    } finally {
      setStartingInterview(false);
    }
  }

  async function handleLockBrief() {
    if (!selectedProjectId || !selectedInterview || lockingInterview) return;
    setLockingInterview(true);
    try {
      const session = await v1Client.interviews.lockInterviewSession(
        { projectId: selectedProjectId, sessionId: selectedInterview.id },
        {},
      );
      setInterviewsByProject((current) => ({
        ...current,
        [selectedProjectId]: session,
      }));
      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          buildConsoleSystemMessage('Interview brief locked.', 'interviewer'),
        ],
      }));
      await loadProjectState(selectedProjectId);
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          buildConsoleSystemMessage(message || 'Failed to lock the interview brief.', 'interviewer'),
        ],
      }));
    } finally {
      setLockingInterview(false);
    }
  }

  async function handleLaunchMission() {
    if (!selectedProjectId || !selectedInterview || launchingMission || interviewRun) return;
    setLaunchingMission(true);
    try {
      const run = await v1Client.generationRuns.createGenerationRun(
        { projectId: selectedProjectId },
        { interviewSessionId: selectedInterview.id },
      );
      setRunsByProject((current) => ({
        ...current,
        [selectedProjectId]: [run, ...(current[selectedProjectId] ?? [])],
      }));
      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          buildConsoleSystemMessage('Autonomous mission launched from the locked brief.', 'interviewer'),
        ],
      }));
      await loadProjectState(selectedProjectId);
    } catch (error: unknown) {
      const message =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
          : undefined;
      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          buildConsoleSystemMessage(message || 'Failed to launch the autonomous mission.', 'interviewer'),
        ],
      }));
    } finally {
      setLaunchingMission(false);
    }
  }

  async function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed || sending || !selectedProjectId) return;

    const targetId = selectedTargetId;
    setDraft('');
    setSending(true);

    if (thinkingTimeoutRef.current) {
      window.clearTimeout(thinkingTimeoutRef.current);
    }

    thinkingTimeoutRef.current = window.setTimeout(() => {
      setSending(false);
      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          buildConsoleSystemMessage(
            targetId === 'broadcast'
              ? 'No reply from the hall.'
              : targetId === 'interviewer'
                ? 'The interviewer did not answer in time.'
                : `No reply from ${selectedAgent?.name ?? 'the selected agent'}.`,
            targetId === 'broadcast' ? 'broadcast' : targetId,
          ),
        ],
      }));
      thinkingTimeoutRef.current = null;
    }, 30_000);

    try {
      if (targetId === 'interviewer') {
        const session = selectedInterview
          ? await v1Client.interviews.appendInterviewMessage(
            { projectId: selectedProjectId, sessionId: selectedInterview.id },
            { content: trimmed },
          )
          : await v1Client.interviews.createInterviewSession(
            { projectId: selectedProjectId },
            { initialPrompt: trimmed },
          );

        if (thinkingTimeoutRef.current) {
          window.clearTimeout(thinkingTimeoutRef.current);
          thinkingTimeoutRef.current = null;
        }

        setInterviewsByProject((current) => ({
          ...current,
          [selectedProjectId]: session,
        }));
        await loadProjectState(selectedProjectId);
        return;
      }

      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          buildConsoleUserMessage(trimmed, targetId),
        ],
      }));

      const data = await v1Client.console.sendConsoleMessage(
        { projectId: selectedProjectId },
        { agentId: targetId, message: trimmed },
      );

      if (thinkingTimeoutRef.current) {
        window.clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }

      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          ...data.replies.map((reply) => buildConsoleAgentMessage(
            reply.reply,
            reply.fromAgentId,
            reply.fromLabel,
            targetId,
            reply.responseMode,
          )),
        ],
      }));
    } catch {
      if (thinkingTimeoutRef.current) {
        window.clearTimeout(thinkingTimeoutRef.current);
        thinkingTimeoutRef.current = null;
      }

      setMessagesByProject((current) => ({
        ...current,
        [selectedProjectId]: [
          ...(current[selectedProjectId] ?? []),
          buildConsoleSystemMessage(targetId === 'broadcast'
            ? 'The hall did not answer cleanly.'
            : targetId === 'interviewer'
              ? 'The interviewer did not accept that turn.'
              : `No clean reply from ${selectedAgent?.name ?? 'the selected agent'}.`, targetId),
        ],
      }));
    } finally {
      setSending(false);
    }
  }

  if (!isLoading && !fetchError && sortedProjects.length === 0) {
    return (
      <div className="forge-console-page">
        <div className="forge-console-empty">
          <div className="forge-console-empty__panel">
            <p className="forge-eyebrow">DND Booker</p>
            <h2>The Forge Awaits A Project</h2>
            <p>
              The Forge Console is now the operator shell for DND Booker. Create a project,
              then direct the hall from one place.
            </p>
            <button className="forge-console-button forge-console-button--accent" onClick={() => setShowCreateModal(true)} type="button">
              <Plus size={14} strokeWidth={2} />
              Create Project
            </button>
          </div>
        </div>
        <CreateProjectModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          navigateOnCreate={false}
          onCreated={(project) => {
            setSelectedProjectId(project.id);
            setShowCreateModal(false);
          }}
        />
      </div>
    );
  }

  return (
    <div className="forge-console-page">
      <header className="forge-console-topbar">
        <div className="forge-console-topbar__brand">
          <p className="forge-eyebrow">DND Booker</p>
          <h1>The DM&apos;s Forge</h1>
        </div>

        <div className="forge-console-topbar__controls">
          <select
            aria-label="Select active project"
            className="forge-console-select"
            disabled={sortedProjects.length === 0}
            onChange={(event) => setSelectedProjectId(event.target.value)}
            value={selectedProjectId ?? ''}
          >
            {sortedProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
          {selectedProject ? (
            <Link className="forge-console-button" to={`/projects/${selectedProject.id}`}>
              <BookOpen size={14} strokeWidth={2} />
              Open Editor
            </Link>
          ) : null}
          <button className="forge-console-button forge-console-button--accent" onClick={() => setShowCreateModal(true)} type="button">
            <Plus size={14} strokeWidth={2} />
            New Project
          </button>
          <button className="forge-console-button" onClick={() => void logout()} type="button">
            <LogOut size={14} strokeWidth={2} />
            Logout
          </button>
        </div>

        <div className="forge-console-topbar__meta">
          <div className={`forge-console-chip forge-console-chip--${connectionState}`}>
            <Circle className="forge-console-chip__dot" size={10} fill="currentColor" strokeWidth={0} />
            <span>{connectionState}</span>
          </div>
          <div className="forge-console-chip">
            <Users size={14} strokeWidth={2} />
            <span>{activeAgentCount} active agents</span>
          </div>
          <div className="forge-console-chip">
            <Signal size={14} strokeWidth={2} />
            <span>{agents.length} in roster</span>
          </div>
          {user ? (
            <div className="forge-console-chip">
              <span>{user.displayName}</span>
            </div>
          ) : null}
        </div>
      </header>

      <main className="forge-console-grid">
        <aside className="forge-agent-board">
          <div className="forge-console-panel-heading">
            <p className="forge-eyebrow">Agent Board</p>
            <h2>{selectedProject?.title ?? 'No Project Selected'}</h2>
          </div>

          <p className="forge-console-project-meta">
            {selectedProject?.description?.trim()
              ? selectedProject.description
              : 'No project description yet. The hall will work from the structured brief and latest run state.'}
          </p>

          {fetchError ? (
            <p className="forge-console-project-meta">Project load error: {fetchError}</p>
          ) : null}

          <div className="forge-agent-list">
            {isLoading && !selectedProject ? (
              <div className="forge-console-project-meta">Loading projects…</div>
            ) : agents.length === 0 ? (
              <div className="forge-console-project-meta">Waiting for agent status from the server…</div>
            ) : agents.map((agent) => (
              <AgentCard
                agent={agent}
                key={agent.id}
                onSelect={() => setSelectedTarget(agent.id)}
                selected={selectedTargetId === agent.id}
              />
            ))}
          </div>

          <div className="forge-broadcast-wrap">
            <p className="forge-broadcast-label">Broadcast</p>
            <AgentCard
              agent={{
                id: 'broadcast',
                name: 'All Agents',
                role: 'Hall Command',
                iconKey: 'broadcast',
                status: activeAgentCount > 0 ? 'working' : 'idle',
                currentTask: activeAgentCount > 0
                  ? `${activeAgentCount} agents are currently active in the hall.`
                  : 'No specialists are currently active.',
                progress: 0,
                queue: ['Route work to the hall', 'Collect multi-agent replies'],
                lastPing: activeAgentCount > 0 ? 'just now' : 'idle',
              }}
              broadcast
              onSelect={() => setSelectedTarget('broadcast')}
              selected={selectedTargetId === 'broadcast'}
            />
          </div>
        </aside>

        <section className="forge-chat-pane">
          <header className="forge-chat-pane__header">
            <div className="forge-chat-pane__header-top">
              <div>
                <p className="forge-eyebrow">{selectedTargetId === 'broadcast' ? 'Broadcast' : 'Counsel With'}</p>
                <h2>{chatTitle}</h2>
                <p className="forge-chat-pane__subheader">Currently: {chatTask}</p>
                {selectedTargetId === 'interviewer' ? (
                  <div className="forge-interview-meta" data-testid="interview-meta">
                    <span className="forge-interview-meta__chip">
                      Status: {selectedInterview?.status ?? 'not started'}
                    </span>
                    <span className="forge-interview-meta__chip">
                      Turns: {interviewerUserTurnCount}/{selectedInterview?.maxUserTurns ?? 8}
                    </span>
                    <span className="forge-interview-meta__chip">
                      Budget: {interviewerBudgetLane ?? 'unset'}
                    </span>
                    <span className="forge-interview-meta__chip">
                      Missing: {selectedInterview?.missingFields.length ? selectedInterview.missingFields.join(', ') : 'none'}
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="forge-chat-pane__task-chip">
                <span>{selectedProject?.type?.replace('_', ' ') ?? 'project'}</span>
              </div>
            </div>
            {selectedTargetId === 'interviewer' ? (
              <div className="forge-interview-actions">
                <button
                  className="forge-console-button"
                  disabled={startingInterview}
                  onClick={() => void handleStartNewInterview()}
                  type="button"
                >
                  {startingInterview ? 'Starting…' : 'Start New Interview'}
                </button>
                <button
                  className="forge-console-button"
                  disabled={!selectedInterview || selectedInterview.status === 'locked' || lockingInterview}
                  onClick={() => void handleLockBrief()}
                  type="button"
                >
                  {lockingInterview ? 'Locking…' : 'Lock Brief'}
                </button>
                <button
                  className="forge-console-button forge-console-button--accent"
                  disabled={!selectedInterview || selectedInterview.status !== 'locked' || Boolean(interviewRun) || launchingMission}
                  onClick={() => void handleLaunchMission()}
                  type="button"
                >
                  {launchingMission ? 'Launching…' : interviewRun ? 'Mission Launched' : 'Launch Mission'}
                </button>
              </div>
            ) : null}
          </header>

          <MessageList messages={visibleMessages} thinkingLabel={thinkingLabel} />

          <Composer
            disabled={selectedTargetId === 'interviewer' ? interviewerComposerDisabled : !selectedProjectId}
            onChange={setDraft}
            onSend={() => void handleSend()}
            placeholder={composerPlaceholder}
            sending={sending}
            value={draft}
          />
        </section>
      </main>

      <CreateProjectModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        navigateOnCreate={false}
        onCreated={(project) => {
          setSelectedProjectId(project.id);
          setShowCreateModal(false);
        }}
      />
    </div>
  );
}
