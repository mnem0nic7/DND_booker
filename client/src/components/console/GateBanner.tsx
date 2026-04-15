import type { GraphInterrupt } from '@dnd-booker/shared';

interface GateBannerProps {
  gate: GraphInterrupt;
  onApprove: () => void;
  onRequestChanges: () => void;
}

export function GateBanner({ gate, onApprove, onRequestChanges }: GateBannerProps) {
  return (
    <div className="forge-gate-banner">
      <span className="forge-gate-banner__icon" aria-hidden="true">⚑</span>
      <div className="forge-gate-banner__text">
        <span className="forge-gate-banner__title">{gate.title}</span>
        {gate.summary !== null && (
          <p className="forge-gate-banner__summary">{gate.summary}</p>
        )}
      </div>
      <button className="forge-gate-banner__approve" onClick={onApprove}>
        Approve →
      </button>
      <button className="forge-gate-banner__changes" onClick={onRequestChanges}>
        Request changes
      </button>
    </div>
  );
}
