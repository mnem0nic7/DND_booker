import { useEffect, useRef, useState } from 'react';
import type { ConsoleMessage } from '../../lib/forgeConsole';
import { buildConsoleAgentMessage, buildConsoleSystemMessage, buildConsoleUserMessage } from '../../lib/forgeConsole';
import { v1Client } from '../../lib/api';
import { MessageList } from '../console/MessageList';
import { Composer } from '../console/Composer';

interface ChatProjectCreationProps {
  onCreated: (project: { id: string }) => void;
}

const WELCOME_MESSAGE = buildConsoleAgentMessage(
  "Tell me about the D&D project you want to create. What kind of adventure, supplement, or sourcebook do you have in mind?",
  'interviewer',
  'The Interviewer',
  'interviewer',
  'model',
);

export function ChatProjectCreation({ onCreated }: ChatProjectCreationProps) {
  const [messages, setMessages] = useState<ConsoleMessage[]>([WELCOME_MESSAGE]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [hasCreated, setHasCreated] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending || hasCreated) return;

    setMessages((prev) => [...prev, buildConsoleUserMessage(text, 'interviewer')]);
    setSending(true);
    setDraft('');

    try {
      const project = await v1Client.projects.createProject({ title: 'New Project', type: 'campaign' });
      const session = await v1Client.interviews.createInterviewSession({ projectId: project.id }, {});
      const updatedSession = await v1Client.interviews.appendInterviewMessage(
        { projectId: project.id, sessionId: session.id },
        { content: text },
      );

      const lastAssistantTurn = [...updatedSession.turns]
        .reverse()
        .find((turn) => turn.role === 'assistant');

      if (lastAssistantTurn) {
        setMessages((prev) => [
          ...prev,
          buildConsoleAgentMessage(
            lastAssistantTurn.content,
            'interviewer',
            'The Interviewer',
            'interviewer',
            'model',
          ),
        ]);
      }

      if (!mountedRef.current) return;
      setHasCreated(true);
      onCreated({ id: project.id });
    } catch {
      if (!mountedRef.current) return;
      setMessages((prev) => [
        ...prev,
        buildConsoleSystemMessage('Something went wrong. Please try again.'),
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="forge-console-page forge-create-panel">
      <MessageList
        messages={messages}
        thinkingLabel={sending ? "The Interviewer is thinking..." : null}
      />
      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => { void handleSend(); }}
        sending={sending}
        disabled={sending || hasCreated}
        placeholder="Describe your project..."
      />
    </div>
  );
}
