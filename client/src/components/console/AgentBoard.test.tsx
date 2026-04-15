// client/src/components/console/AgentBoard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentBoard } from './AgentBoard';
import type { ConsoleAgent } from '@dnd-booker/shared';

function buildAgent(id: string, name: string, status: ConsoleAgent['status'] = 'idle'): ConsoleAgent {
  return { id, name, role: 'specialist', iconKey: id, status, currentTask: 'doing work', progress: 40, queue: [], lastPing: '2026-04-15T00:00:00.000Z' };
}

const agents = [
  buildAgent('interviewer', 'Interviewer'),
  buildAgent('writer', 'Writer', 'working'),
  buildAgent('critic', 'Critic'),
];

describe('AgentBoard', () => {
  it('renders all agent names', () => {
    render(<AgentBoard agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} runStatus={null} />);
    expect(screen.getByText('Interviewer')).toBeInTheDocument();
    expect(screen.getByText('Writer')).toBeInTheDocument();
    expect(screen.getByText('Critic')).toBeInTheDocument();
  });

  it('calls onSelectAgent with the clicked agent id', async () => {
    const onSelectAgent = vi.fn();
    render(<AgentBoard agents={agents} selectedAgentId="interviewer" onSelectAgent={onSelectAgent} runStatus={null} />);
    await userEvent.click(screen.getByRole('button', { name: /critic/i }));
    expect(onSelectAgent).toHaveBeenCalledWith('critic');
  });

  it('applies the selected class to the card matching selectedAgentId', () => {
    render(<AgentBoard agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} runStatus={null} />);
    expect(screen.getByRole('button', { name: /writer/i })).toHaveClass('is-selected');
    expect(screen.getByRole('button', { name: /critic/i })).not.toHaveClass('is-selected');
  });

  it('renders the run status in the board header', () => {
    render(<AgentBoard agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} runStatus="running" />);
    const badge = screen.getByText('running');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('forge-board__run-status--running');
  });

  it('renders nothing in the header status when runStatus is null', () => {
    render(<AgentBoard agents={agents} selectedAgentId="writer" onSelectAgent={() => {}} runStatus={null} />);
    expect(screen.queryByText('running')).not.toBeInTheDocument();
  });
});
