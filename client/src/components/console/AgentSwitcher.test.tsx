// client/src/components/console/AgentSwitcher.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentSwitcher } from './AgentSwitcher';
import type { ConsoleAgent } from '@dnd-booker/shared';

function buildAgent(id: string, name: string, status: ConsoleAgent['status'] = 'idle'): ConsoleAgent {
  return { id, name, role: 'specialist', iconKey: id, status, currentTask: null, progress: 0, queue: [], lastPing: '2026-04-15T00:00:00.000Z' };
}

const agents = [
  buildAgent('interviewer', 'Interviewer', 'working'),
  buildAgent('writer', 'Writer', 'working'),
  buildAgent('critic', 'Critic', 'idle'),
];

describe('AgentSwitcher', () => {
  it('shows the selected agent name in the trigger', () => {
    render(<AgentSwitcher agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} />);
    expect(screen.getByRole('button', { name: /writer/i })).toBeInTheDocument();
  });

  it('opens the dropdown and shows all agent names on trigger click', async () => {
    render(<AgentSwitcher agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /writer/i }));
    expect(screen.getByRole('option', { name: /interviewer/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /critic/i })).toBeInTheDocument();
  });

  it('calls onSelectAgent with the agent id when an option is clicked', async () => {
    const onSelectAgent = vi.fn();
    render(<AgentSwitcher agents={agents} selectedAgentId="writer" onSelectAgent={onSelectAgent} />);
    await userEvent.click(screen.getByRole('button', { name: /writer/i }));
    await userEvent.click(screen.getByRole('option', { name: /interviewer/i }));
    expect(onSelectAgent).toHaveBeenCalledWith('interviewer');
  });

  it('closes the dropdown after selection', async () => {
    render(<AgentSwitcher agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /writer/i }));
    await userEvent.click(screen.getByRole('option', { name: /critic/i }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
