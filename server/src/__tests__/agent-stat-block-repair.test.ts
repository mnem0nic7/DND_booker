import { describe, expect, it } from 'vitest';
import { assessStatBlockAttrs } from '@dnd-booker/shared';
import { repairStatBlockAttrsDeterministically } from '../services/agent/stat-block-repair.service.js';

describe('agent stat-block repair', () => {
  it('repairs the common ghostly placeholder pattern deterministically', () => {
    const repaired = repairStatBlockAttrsDeterministically({
      name: 'Phantom Apparition',
      type: 'Medium undead',
      ac: 0,
      hp: 0,
      speed: '0 ft., fly 40 ft. (hover)',
      str: 10,
      dex: 10,
      con: 10,
      int: 10,
      wis: 10,
      cha: 10,
    });

    const assessment = assessStatBlockAttrs(repaired);
    expect(repaired.speed).toBe('fly 40 ft. (hover)');
    expect(repaired.ac).toBe(12);
    expect(repaired.hp).toBe(22);
    expect(assessment.flags).not.toContain('suspicious_speed');
    expect(assessment.flags).not.toContain('invalid_ac');
    expect(assessment.flags).not.toContain('invalid_hp');
  });
});
