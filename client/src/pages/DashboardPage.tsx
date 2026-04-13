import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BookOpen, Circle, LogOut, Plus, Signal, Users } from 'lucide-react';
import type { ConsoleAgent } from '@dnd-booker/shared';
import { v1Client } from '../lib/api';
import {
  buildConsoleAgentMessage,
  buildConsoleSystemMessage,
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

export default function DashboardPage() {
  const { user, logout } = useAuthStore();
  const { projects, isLoading, fetchError, fetchProjects } = useProjectStore();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [agents, setAgents] = useState<ConsoleAgent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>('live');
  const [selectedTargetsByProject, setSelectedTargetsByProject] = useState<Record<string, ConsoleChatTargetId>>({});
  const [messagesByProject, setMessagesByProject] = useState<Record<string, ConsoleMessage[]>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
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

  useEffect(() => {
    if (!selectedProjectId) {
      setAgents([]);
      return;
    }

    const projectId = selectedProjectId;
    setAgents([]);
    let active = true;

    async function pollAgents() {
      try {
        const data = await v1Client.console.listConsoleAgents({ projectId });
        if (!active) return;
        setAgents(data);
        setConnectionState('live');
      } catch {
        if (!active) return;
        setConnectionState('reconnecting');
      }
    }

    void pollAgents();
    const poller = window.setInterval(() => {
      void pollAgents();
    }, 5_000);

    return () => {
      active = false;
      window.clearInterval(poller);
    };
  }, [selectedProjectId]);

  useEffect(() => () => {
    if (thinkingTimeoutRef.current) {
      window.clearTimeout(thinkingTimeoutRef.current);
    }
  }, []);

  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === selectedTargetId) ?? null,
    [agents, selectedTargetId],
  );

  useEffect(() => {
    setDraft('');
  }, [selectedProjectId, selectedTargetId]);

  const visibleMessages = useMemo(
    () => filterConsoleMessages(messagesByProject[selectedProjectId ?? ''] ?? [], selectedTargetId),
    [messagesByProject, selectedProjectId, selectedTargetId],
  );

  const activeAgentCount = useMemo(() => getActiveConsoleAgentCount(agents), [agents]);

  const chatTitle = selectedTargetId === 'broadcast' ? 'All Agents' : selectedAgent?.name ?? 'The Forgemaster';
  const chatTask = selectedTargetId === 'broadcast'
    ? `${activeAgentCount} agents active in the hall`
    : selectedAgent?.currentTask ?? 'Awaiting instruction.';
  const composerPlaceholder = selectedTargetId === 'broadcast'
    ? 'Address all agents in the hall...'
    : `Send word to ${selectedAgent?.name ?? 'the selected agent'}...`;
  const thinkingLabel = sending
    ? selectedTargetId === 'broadcast'
      ? 'The hall is considering your command...'
      : `${selectedAgent?.name ?? 'The agent'} is thinking...`
    : null;

  function setSelectedTarget(targetId: ConsoleChatTargetId) {
    if (!selectedProjectId) return;
    setSelectedTargetsByProject((current) => ({
      ...current,
      [selectedProjectId]: targetId,
    }));
  }

  async function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed || sending || !selectedProjectId) return;

    const targetId = selectedTargetId;
    setMessagesByProject((current) => ({
      ...current,
      [selectedProjectId]: [
        ...(current[selectedProjectId] ?? []),
        buildConsoleUserMessage(trimmed, targetId),
      ],
    }));
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
          buildConsoleSystemMessage('No reply from the hall.'),
        ],
      }));
      thinkingTimeoutRef.current = null;
    }, 30_000);

    try {
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
            : `No clean reply from ${selectedAgent?.name ?? 'the selected agent'}.`),
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
              </div>
              <div className="forge-chat-pane__task-chip">
                <span>{selectedProject?.type?.replace('_', ' ') ?? 'project'}</span>
              </div>
            </div>
          </header>

          <MessageList messages={visibleMessages} thinkingLabel={thinkingLabel} />

          <Composer
            disabled={!selectedProjectId}
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
