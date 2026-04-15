import type { ConsoleAgent, GraphInterrupt } from '@dnd-booker/shared';
import type { ConsoleMessage } from '../../lib/forgeConsole';
import { AgentSwitcher } from './AgentSwitcher';
import { GateBanner } from './GateBanner';
import { MessageList } from './MessageList';
import { Composer } from './Composer';

interface ChatPanelProps {
  agents: ConsoleAgent[];
  selectedAgentId: string;
  messages: ConsoleMessage[];
  pendingGate: GraphInterrupt | null;
  draft: string;
  sending: boolean;
  onSelectAgent: (id: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onApproveGate: () => void;
  onRequestChanges: () => void;
}

export function ChatPanel({
  agents,
  selectedAgentId,
  messages,
  pendingGate,
  draft,
  sending,
  onSelectAgent,
  onDraftChange,
  onSend,
  onApproveGate,
  onRequestChanges,
}: ChatPanelProps) {
  const composerPlaceholder = pendingGate !== null
    ? 'Approve the gate above to continue...'
    : 'Message the agent…';

  return (
    <div className="forge-chat-panel">
      <div className="forge-chat-panel__header">
        <AgentSwitcher
          agents={agents}
          selectedAgentId={selectedAgentId}
          onSelectAgent={onSelectAgent}
        />
        <span className="forge-chat-panel__hint">click any agent card to switch</span>
      </div>

      <MessageList messages={messages} thinkingLabel={null} />

      {pendingGate !== null && (
        <GateBanner
          gate={pendingGate}
          onApprove={onApproveGate}
          onRequestChanges={onRequestChanges}
        />
      )}

      <Composer
        value={draft}
        placeholder={composerPlaceholder}
        sending={sending}
        disabled={pendingGate !== null}
        onChange={onDraftChange}
        onSend={onSend}
      />
    </div>
  );
}
