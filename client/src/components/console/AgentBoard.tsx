import type { ConsoleAgent } from '@dnd-booker/shared';
import { AgentCard } from './AgentCard';

interface AgentBoardProps {
  agents: ConsoleAgent[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  runStatus: string | null;
}

export function AgentBoard({ agents, selectedAgentId, onSelectAgent, runStatus }: AgentBoardProps) {
  return (
    <aside className="forge-board">
      <div className="forge-board__header">
        <span className="forge-board__label">AGENTS {agents.length}</span>
        {runStatus !== null && (
          <span className={`forge-board__run-status forge-board__run-status--${runStatus}`}>
            {runStatus}
          </span>
        )}
      </div>
      <div className="forge-board__cards">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            selected={agent.id === selectedAgentId}
            onSelect={() => onSelectAgent(agent.id)}
          />
        ))}
      </div>
    </aside>
  );
}
