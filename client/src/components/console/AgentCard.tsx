import type { ComponentType } from 'react';
import {
  Columns3,
  Feather,
  Hammer,
  Image as ImageIcon,
  Loader2,
  PenBox,
  Printer,
  RadioTower,
  ScrollText,
  Search,
  Sparkles,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import type { ConsoleAgent } from '@dnd-booker/shared';

const iconMap: Record<string, ComponentType<{ className?: string; size?: number; strokeWidth?: number }>> = {
  scroll: ScrollText,
  feather: Feather,
  sparkles: Sparkles,
  radio: RadioTower,
  hammer: Hammer,
  columns: Columns3,
  image: ImageIcon,
  search: Search,
  printer: Printer,
  pen: PenBox,
};

interface AgentCardProps {
  agent: ConsoleAgent;
  selected: boolean;
  onSelect: () => void;
  broadcast?: boolean;
}

export function AgentCard({ agent, selected, onSelect, broadcast = false }: AgentCardProps) {
  const Icon = broadcast ? UserRound : (iconMap[agent.iconKey] ?? ScrollText);

  return (
    <button
      className={`forge-agent-card${selected ? ' is-selected' : ''}${broadcast ? ' is-broadcast' : ''}`}
      onClick={onSelect}
      type="button"
      title={agent.queue.length > 0 ? `Queue:\n${agent.queue.slice(0, 2).join('\n')}` : undefined}
    >
      <div className="forge-agent-card__header">
        <div className="forge-agent-card__identity">
          <div className="forge-agent-card__icon-shell">
            <Icon className="forge-agent-card__icon" size={18} strokeWidth={1.9} />
          </div>
          <div>
            <div className="forge-agent-card__name-row">
              <span className="forge-agent-card__name">{agent.name}</span>
              {agent.status === 'working' ? (
                <Loader2 className="forge-agent-card__spinner" size={14} strokeWidth={2} />
              ) : null}
            </div>
            <p className="forge-agent-card__role">{agent.role}</p>
          </div>
        </div>
        <span className={`forge-status-pill forge-status-pill--${agent.status}`}>
          {agent.status === 'error' ? <TriangleAlert size={12} strokeWidth={2.3} /> : null}
          {agent.status}
        </span>
      </div>

      <p className={`forge-agent-card__task${agent.currentTask ? '' : ' forge-agent-card__task--muted'}`}>
        {agent.currentTask ?? (broadcast ? 'Address the entire hall at once.' : 'No active task in queue.')}
      </p>

      {agent.status === 'working' ? (
        <div className="forge-agent-card__progress" aria-hidden="true">
          <span className="forge-agent-card__progress-fill" style={{ width: `${agent.progress}%` }} />
        </div>
      ) : (
        <div className="forge-agent-card__progress forge-agent-card__progress--ghost" aria-hidden="true" />
      )}

      <div className="forge-agent-card__footer">
        <span className="forge-agent-card__status-label">{broadcast ? 'broadcast' : agent.status}</span>
        <span className="forge-agent-card__last-ping">{agent.lastPing}</span>
      </div>
    </button>
  );
}
