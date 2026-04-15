// client/src/components/console/GateBanner.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GateBanner } from './GateBanner';
import type { GraphInterrupt } from '@dnd-booker/shared';

function buildGate(overrides?: Partial<GraphInterrupt>): GraphInterrupt {
  return {
    id: 'gate-1',
    runType: 'generation',
    runId: 'run-1',
    kind: 'publication_review',
    title: 'Outline approval gate',
    summary: '6 chapters ready · Critic score 87/100',
    status: 'pending',
    payload: null,
    resolutionPayload: null,
    resolvedByUserId: null,
    createdAt: '2026-04-15T00:00:00.000Z',
    resolvedAt: null,
    ...overrides,
  };
}

describe('GateBanner', () => {
  it('renders gate title and summary', () => {
    render(<GateBanner gate={buildGate()} onApprove={() => {}} onRequestChanges={() => {}} />);
    expect(screen.getByText('Outline approval gate')).toBeInTheDocument();
    expect(screen.getByText('6 chapters ready · Critic score 87/100')).toBeInTheDocument();
  });

  it('calls onApprove when Approve button is clicked', async () => {
    const onApprove = vi.fn();
    const onRequestChanges = vi.fn();
    render(<GateBanner gate={buildGate()} onApprove={onApprove} onRequestChanges={onRequestChanges} />);
    await userEvent.click(screen.getByRole('button', { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledOnce();
    expect(onRequestChanges).not.toHaveBeenCalled();
  });

  it('calls onRequestChanges when Request changes button is clicked', async () => {
    const onRequestChanges = vi.fn();
    const onApprove = vi.fn();
    render(<GateBanner gate={buildGate()} onApprove={onApprove} onRequestChanges={onRequestChanges} />);
    await userEvent.click(screen.getByRole('button', { name: /request changes/i }));
    expect(onRequestChanges).toHaveBeenCalledOnce();
    expect(onApprove).not.toHaveBeenCalled();
  });

  it('omits the summary line when summary is null', () => {
    render(<GateBanner gate={buildGate({ summary: null })} onApprove={() => {}} onRequestChanges={() => {}} />);
    expect(screen.getByText('Outline approval gate')).toBeInTheDocument();
    expect(screen.queryByText('6 chapters ready · Critic score 87/100')).not.toBeInTheDocument();
  });
});
