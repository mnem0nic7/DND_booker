import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ConsoleAgent, GenerationRun, InterviewSession } from '@dnd-booker/shared';
import { v1Client } from '../../lib/api';
import {
  buildConsoleAgentMessage,
  buildConsoleUserMessage,
  buildInterviewThreadMessages,
  type ConsoleMessage,
} from '../../lib/forgeConsole';
import { readPendingGraphInterrupts } from '../../lib/graphInterrupts';
import { useGenerationStore } from '../../stores/generationStore';
import { AgentBoard } from './AgentBoard';
import { ChatPanel } from './ChatPanel';

// Maps AgentStage values to the ConsoleAgent.id that should show status: 'working'.
// Mirrors AGENT_STAGE_TO_AGENT_ID in server/src/services/forge-console.service.ts.
const AGENT_STAGE_MAP: Partial<Record<string, string>> = {
  interview_locked: 'interviewer',
  writer_story_packet: 'writer',
  rewrite_writer: 'writer',
  dnd_expert_inserts: 'dnd_expert',
  rewrite_dnd_expert: 'dnd_expert',
  layout_first_draft: 'layout_expert',
  rewrite_layout: 'layout_expert',
  artist_requested: 'artist',
  artist_completed: 'artist',
  critic_text_pass: 'critic',
  critic_image_pass: 'critic',
  final_editor: 'final_editor',
  printer: 'printer',
};

const SYNTHETIC_INTERVIEWER: ConsoleAgent = {
  id: 'interviewer',
  name: 'Interviewer',
  role: 'Project intake specialist',
  iconKey: 'interviewer',
  status: 'idle',
  currentTask: null,
  progress: 0,
  queue: [],
  lastPing: 'just now',
};

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

interface ForgeShellProps {
  projectId: string;
}

export function ForgeShell({ projectId }: ForgeShellProps) {
  const [selectedAgentId, setSelectedAgentId] = useState<string>('interviewer');
  const [agents, setAgents] = useState<ConsoleAgent[]>([]);
  const [interview, setInterview] = useState<InterviewSession | null>(null);
  const [activeRun, setActiveRun] = useState<GenerationRun | null>(null);
  const [messagesByAgent, setMessagesByAgent] = useState<Record<string, ConsoleMessage[]>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [pollMs, setPollMs] = useState(5000);

  const resolveInterrupt = useGenerationStore((s) => s.resolveInterrupt);
  const subscribeToRun = useGenerationStore((s) => s.subscribeToRun);
  const unsubscribe = useGenerationStore((s) => s.unsubscribe);
  const storeEvents = useGenerationStore((s) => s.events);

  const subscribedRunIdRef = useRef<string | null>(null);

  const loadData = useCallback(async () => {
    const [fetchedAgents, fetchedInterview, fetchedRuns] = await Promise.allSettled([
      v1Client.console.listConsoleAgents({ projectId }),
      v1Client.interviews.getLatestInterviewSession({ projectId }),
      v1Client.generationRuns.listGenerationRuns({ projectId }),
    ]);

    if (fetchedAgents.status === 'fulfilled') {
      setAgents(fetchedAgents.value);
    }

    if (fetchedInterview.status === 'fulfilled') {
      setInterview(fetchedInterview.value);
    }

    if (fetchedRuns.status === 'fulfilled') {
      const runs = fetchedRuns.value;
      const active = runs.find((r) => !TERMINAL_STATUSES.has(r.status)) ?? null;
      setActiveRun(active);
    }
  }, [projectId]);

  // Initial load
  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Polling — interval is adaptive: 5s when idle, 30s when SSE is active (heartbeat only)
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      void loadData();
    }, pollMs);

    return () => {
      if (pollIntervalRef.current !== null) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [loadData, pollMs]);

  // Subscribe to SSE when an active run is detected; fall back to polling when idle
  useEffect(() => {
    const isActive = activeRun !== null && !TERMINAL_STATUSES.has(activeRun.status);

    if (!isActive) {
      if (subscribedRunIdRef.current !== null) {
        unsubscribe();
        subscribedRunIdRef.current = null;
      }
      setPollMs(5000);
      return;
    }

    if (subscribedRunIdRef.current === activeRun.id) return; // already subscribed

    subscribeToRun(projectId, activeRun.id);
    subscribedRunIdRef.current = activeRun.id;
    setPollMs(30000);
  }, [activeRun, projectId, subscribeToRun, unsubscribe]);

  // Tear down SSE subscription when projectId changes
  useEffect(() => {
    return () => {
      if (subscribedRunIdRef.current !== null) {
        unsubscribe();
        subscribedRunIdRef.current = null;
      }
    };
  }, [projectId, unsubscribe]);

  // React to SSE events: update run status, agent working state, and handle run end
  useEffect(() => {
    const last = storeEvents[storeEvents.length - 1];
    if (!last || !activeRun || last.runId !== activeRun.id) return;

    if (last.type === 'run_status') {
      setActiveRun((prev) => (prev ? { ...prev, status: last.status } : prev));

      if (last.agentStage) {
        const workingId = AGENT_STAGE_MAP[last.agentStage] ?? null;
        setAgents((prev) =>
          prev.map((a) => ({
            ...a,
            status:
              a.id === workingId
                ? 'working'
                : a.status === 'working'
                  ? 'idle'
                  : a.status,
          }))
        );
      }
    }

    if (last.type === 'run_completed' || last.type === 'run_failed') {
      unsubscribe();
      subscribedRunIdRef.current = null;
      setPollMs(5000);
      void loadData();
    }
  }, [storeEvents, activeRun, unsubscribe, loadData]);

  const allAgents = useMemo<ConsoleAgent[]>(() => {
    const interviewer: ConsoleAgent = {
      ...SYNTHETIC_INTERVIEWER,
      status: (!interview || interview.status === 'locked') ? 'idle' : 'working',
    };
    return [interviewer, ...agents];
  }, [agents, interview]);

  const pendingGate = useMemo(() => {
    if (!activeRun) return null;
    const pending = readPendingGraphInterrupts(
      activeRun.graphStateJson ?? null,
      'generation',
      activeRun.id,
    );
    return pending[0] ?? null;
  }, [activeRun]);

  const visibleMessages = useMemo<ConsoleMessage[]>(() => {
    if (selectedAgentId === 'interviewer') {
      return buildInterviewThreadMessages(interview);
    }
    return messagesByAgent[selectedAgentId] ?? [];
  }, [selectedAgentId, interview, messagesByAgent]);

  const handleSend = useCallback(async () => {
    if (!draft.trim() || sending) return;

    const text = draft.trim();
    setSending(true);
    setDraft('');

    try {
      if (selectedAgentId === 'interviewer') {
        // Use existing session or create one
        let sessionId = interview?.id;
        if (!sessionId) {
          const newSession = await v1Client.interviews.createInterviewSession(
            { projectId },
            {},
          );
          sessionId = newSession.id;
          setInterview(newSession);
        }

        const updated = await v1Client.interviews.appendInterviewMessage(
          { projectId, sessionId },
          { content: text },
        );
        setInterview(updated);
      } else {
        const userMsg = buildConsoleUserMessage(text, selectedAgentId);
        setMessagesByAgent((prev) => ({
          ...prev,
          [selectedAgentId]: [...(prev[selectedAgentId] ?? []), userMsg],
        }));

        const agentName =
          agents.find((a) => a.id === selectedAgentId)?.name ?? selectedAgentId;

        const response = await v1Client.console.sendConsoleMessage(
          { projectId },
          { agentId: selectedAgentId, message: text },
        );

        const replyMessages = response.replies.map((reply) =>
          buildConsoleAgentMessage(
            reply.reply,
            reply.fromAgentId,
            reply.fromLabel || agentName,
            selectedAgentId,
            reply.responseMode,
          ),
        );

        setMessagesByAgent((prev) => ({
          ...prev,
          [selectedAgentId]: [...(prev[selectedAgentId] ?? []), ...replyMessages],
        }));
      }
    } finally {
      setSending(false);
    }
  }, [draft, sending, selectedAgentId, interview, projectId, agents]);

  const handleApproveGate = useCallback(async () => {
    if (!pendingGate || !activeRun) return;
    await resolveInterrupt(projectId, activeRun.id, pendingGate.id, 'approve');
    await loadData();
  }, [pendingGate, activeRun, resolveInterrupt, projectId, loadData]);

  const handleRequestChanges = useCallback(async () => {
    if (!pendingGate || !activeRun) return;
    await resolveInterrupt(projectId, activeRun.id, pendingGate.id, 'edit');
    await loadData();
  }, [pendingGate, activeRun, resolveInterrupt, projectId, loadData]);

  const runStatus = activeRun?.status ?? null;

  return (
    <div className="forge-shell">
      <ChatPanel
        agents={allAgents}
        selectedAgentId={selectedAgentId}
        messages={visibleMessages}
        pendingGate={pendingGate}
        draft={draft}
        sending={sending}
        onSelectAgent={setSelectedAgentId}
        onDraftChange={setDraft}
        onSend={() => { void handleSend(); }}
        onApproveGate={() => { void handleApproveGate(); }}
        onRequestChanges={() => { void handleRequestChanges(); }}
      />
      <AgentBoard
        agents={allAgents}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        runStatus={runStatus}
      />
    </div>
  );
}
