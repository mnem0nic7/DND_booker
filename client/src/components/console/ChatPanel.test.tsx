import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from './ChatPanel';
import type { ConsoleAgent, GraphInterrupt } from '@dnd-booker/shared';
import type { ConsoleMessage } from '../../lib/forgeConsole';

function buildAgent(id: string, name: string): ConsoleAgent {
  return { id, name, role: 'specialist', iconKey: id, status: 'idle', currentTask: null, progress: 0, queue: [], lastPing: '2026-04-15T00:00:00.000Z' };
}

function buildGate(): GraphInterrupt {
  return { id: 'g1', runType: 'generation', runId: 'r1', kind: 'review', title: 'Review gate', summary: '6 chapters', status: 'pending', payload: null, resolutionPayload: null, resolvedByUserId: null, createdAt: '2026-04-15T00:00:00.000Z', resolvedAt: null };
}

const agents = [buildAgent('interviewer', 'Interviewer'), buildAgent('writer', 'Writer')];
const messages: ConsoleMessage[] = [];

function renderPanel(overrides: Partial<Parameters<typeof ChatPanel>[0]> = {}) {
  return render(
    <ChatPanel
      agents={agents}
      selectedAgentId="interviewer"
      messages={messages}
      pendingGate={null}
      draft=""
      sending={false}
      onSelectAgent={() => {}}
      onDraftChange={() => {}}
      onSend={() => {}}
      onApproveGate={() => {}}
      onRequestChanges={() => {}}
      {...overrides}
    />,
  );
}

describe('ChatPanel', () => {
  it('enables the composer when no gate is pending', () => {
    renderPanel();
    expect(screen.getByRole('textbox')).not.toBeDisabled();
  });

  it('disables the composer when a gate is pending', () => {
    renderPanel({ pendingGate: buildGate() });
    expect(screen.getByRole('textbox')).toBeDisabled();
  });

  it('shows the gate banner when a gate is pending', () => {
    renderPanel({ pendingGate: buildGate() });
    expect(screen.getByText('Review gate')).toBeInTheDocument();
  });

  it('hides the gate banner when no gate is pending', () => {
    renderPanel();
    expect(screen.queryByText('Review gate')).not.toBeInTheDocument();
  });

  it('calls onApproveGate when the Approve button in the banner is clicked', async () => {
    const onApproveGate = vi.fn();
    renderPanel({ pendingGate: buildGate(), onApproveGate });
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApproveGate).toHaveBeenCalledOnce();
  });

  it('calls onSend when the send button is clicked with a non-empty draft', async () => {
    const onSend = vi.fn();
    renderPanel({ draft: 'hello', onSend });
    await userEvent.click(screen.getByRole('button', { name: /send/i }));
    expect(onSend).toHaveBeenCalledOnce();
  });
});
