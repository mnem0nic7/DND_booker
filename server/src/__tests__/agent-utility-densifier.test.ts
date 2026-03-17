import { describe, expect, it } from 'vitest';
import { buildFallbackUtilityPacket } from '../services/agent/utility-densifier.service.js';

describe('agent utility densifier', () => {
  it('builds a deterministic DM-running packet for prose-heavy sections', () => {
    const packet = buildFallbackUtilityPacket('Chapter 2: The Mine');

    expect(packet.sceneSetupParagraphs).toHaveLength(2);
    expect(packet.summaryTitle).toBe('DM Running Summary');
    expect(packet.summaryParagraphs).toHaveLength(2);
    expect(packet.clueTitle).toBe('Clues, Leverage, and Payoffs');
    expect(packet.clueBullets).toHaveLength(4);
    expect(packet.signalsAndStakes.length).toBeGreaterThanOrEqual(4);
    expect(packet.escalationSteps).toHaveLength(3);
    expect(packet.consequenceTitle).toBe('Payoffs and Fallout');
    expect(packet.consequenceBullets).toHaveLength(4);
    expect(packet.pressureTitle).toBe('Pressure and Consequences');
    expect(packet.pressureParagraphs).toHaveLength(2);
  });
});
