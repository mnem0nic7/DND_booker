import { useEffect, useRef, useState } from 'react';
import type { ConsoleAgent } from '@dnd-booker/shared';

interface AgentSwitcherProps {
  agents: ConsoleAgent[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
}

export function AgentSwitcher({ agents, selectedAgentId, onSelectAgent }: AgentSwitcherProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  function handleTriggerClick() {
    setOpen((prev) => !prev);
  }

  function handleOptionClick(id: string) {
    onSelectAgent(id);
    setOpen(false);
  }

  return (
    <div className="forge-agent-switcher" ref={containerRef}>
      <button
        type="button"
        className="forge-agent-switcher__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={handleTriggerClick}
      >
        <span
          className={`forge-agent-switcher__dot forge-agent-switcher__dot--${selectedAgent?.status ?? 'idle'}`}
        />
        {selectedAgent?.name ?? ''}
        <span className="forge-agent-switcher__caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <ul role="listbox" className="forge-agent-switcher__dropdown">
          {agents.map((agent) => {
            const isSelected = agent.id === selectedAgentId;
            return (
              <li
                key={agent.id}
                role="option"
                aria-selected={isSelected}
                className={
                  isSelected
                    ? 'forge-agent-switcher__option forge-agent-switcher__option--selected'
                    : 'forge-agent-switcher__option'
                }
                onClick={() => handleOptionClick(agent.id)}
              >
                <span
                  className={`forge-agent-switcher__dot forge-agent-switcher__dot--${agent.status}`}
                />
                {agent.name}
                <span className="forge-agent-switcher__role">{agent.role}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
