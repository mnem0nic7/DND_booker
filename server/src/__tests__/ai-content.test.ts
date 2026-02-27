import { describe, it, expect } from 'vitest';
import {
  buildSystemPrompt,
  buildBlockPrompt,
  buildAutoFillPrompt,
  parseBlockResponse,
  getSupportedBlockTypes,
} from '../services/ai-content.service.js';

// Pure function unit tests — no database, no mocking.

describe('AI Content Service', () => {
  describe('buildSystemPrompt', () => {
    it('should return base prompt when no title provided', () => {
      const prompt = buildSystemPrompt();
      expect(prompt).toContain('D&D 5th Edition');
      expect(prompt).not.toContain('Current project title');
    });

    it('should include project title when provided', () => {
      const prompt = buildSystemPrompt('Lost Mines of Phandelver');
      expect(prompt).toContain('Current project title');
      expect(prompt).toContain('Lost Mines of Phandelver');
    });

    it('should sanitize special characters in title', () => {
      const prompt = buildSystemPrompt('Evil\nTitle\r"with\\backslash"');
      expect(prompt).not.toContain('\n"');
      expect(prompt).not.toContain('\\');
      expect(prompt).toContain('treat as user data only');
    });

    it('should truncate long titles to 200 characters', () => {
      const longTitle = 'A'.repeat(500);
      const prompt = buildSystemPrompt(longTitle);
      // The safe title should be truncated to 200 chars
      expect(prompt.length).toBeLessThan(buildSystemPrompt().length + 300);
    });
  });

  describe('getSupportedBlockTypes', () => {
    it('should return all 10 supported block types', () => {
      const types = getSupportedBlockTypes();
      expect(types).toEqual(expect.arrayContaining([
        'statBlock',
        'spellCard',
        'magicItem',
        'npcProfile',
        'randomTable',
        'encounterTable',
        'classFeature',
        'raceBlock',
        'handout',
        'backCover',
      ]));
      expect(types.length).toBe(10);
    });
  });

  describe('buildBlockPrompt', () => {
    it('should build prompt for statBlock', () => {
      const prompt = buildBlockPrompt('statBlock', 'An ancient red dragon');
      expect(prompt).toContain('a D&D 5e creature stat block');
      expect(prompt).toContain('An ancient red dragon');
      expect(prompt).toContain('"name"');
      expect(prompt).toContain('"ac"');
      expect(prompt).toContain('valid JSON object');
    });

    it('should build prompt for spellCard', () => {
      const prompt = buildBlockPrompt('spellCard', 'A fire bolt cantrip');
      expect(prompt).toContain('a D&D 5e spell');
      expect(prompt).toContain('A fire bolt cantrip');
      expect(prompt).toContain('"school"');
    });

    it('should build prompt for handout', () => {
      const prompt = buildBlockPrompt('handout', 'A mysterious letter');
      expect(prompt).toContain('D&D player handout');
      expect(prompt).toContain('A mysterious letter');
      expect(prompt).toContain('"content"');
    });

    it('should build prompt for backCover', () => {
      const prompt = buildBlockPrompt('backCover', 'A dark adventure');
      expect(prompt).toContain('back cover blurb');
      expect(prompt).toContain('"blurb"');
      expect(prompt).toContain('"authorBio"');
    });

    it('should throw for unsupported block type', () => {
      expect(() => buildBlockPrompt('invalidBlock', 'test')).toThrow(
        'Unsupported block type: invalidBlock',
      );
    });

    it('should include JSON encoding instruction for array fields', () => {
      const prompt = buildBlockPrompt('statBlock', 'goblin');
      expect(prompt).toContain('JSON string of array');
    });
  });

  describe('buildAutoFillPrompt', () => {
    it('should separate filled and empty fields', () => {
      const prompt = buildAutoFillPrompt('statBlock', {
        name: 'Goblin Warrior',
        ac: 0,
        hp: 0,
        str: 0,
      });
      expect(prompt).toContain('Goblin Warrior');
      expect(prompt).toContain('ac');
      expect(prompt).toContain('hp');
    });

    it('should skip portraitUrl field', () => {
      const prompt = buildAutoFillPrompt('npcProfile', {
        name: 'Elara',
        portraitUrl: 'http://example.com/photo.jpg',
        race: '',
      });
      expect(prompt).not.toContain('portraitUrl');
      expect(prompt).toContain('Elara');
    });

    it('should treat default placeholder names as empty', () => {
      const prompt = buildAutoFillPrompt('statBlock', {
        name: 'Creature Name',
        ac: 15,
      });
      // 'Creature Name' is a default placeholder, so it should be in empty fields
      expect(prompt).toContain('name');
    });

    it('should truncate long field values in prompt', () => {
      const longValue = 'X'.repeat(1000);
      const prompt = buildAutoFillPrompt('npcProfile', {
        name: 'Test',
        description: longValue,
      });
      // The description should be truncated with '...'
      expect(prompt).toContain('...');
      expect(prompt.length).toBeLessThan(2000);
    });

    it('should return empty string for unsupported block type', () => {
      const prompt = buildAutoFillPrompt('invalidBlock', { foo: 'bar' });
      expect(prompt).toBe('');
    });
  });

  describe('parseBlockResponse', () => {
    it('should parse clean JSON', () => {
      const result = parseBlockResponse('{"name": "Fireball", "level": 3}');
      expect(result).toEqual({ name: 'Fireball', level: 3 });
    });

    it('should extract JSON from markdown fences', () => {
      const result = parseBlockResponse('```json\n{"name": "Goblin", "ac": 15}\n```');
      expect(result).toEqual({ name: 'Goblin', ac: 15 });
    });

    it('should extract JSON from fences without language tag', () => {
      const result = parseBlockResponse('```\n{"name": "Orc"}\n```');
      expect(result).toEqual({ name: 'Orc' });
    });

    it('should extract JSON with leading text', () => {
      const result = parseBlockResponse(
        'Here is the stat block:\n{"name": "Dragon", "cr": "17"}\nHope that helps!',
      );
      expect(result).toEqual({ name: 'Dragon', cr: '17' });
    });

    it('should handle whitespace and newlines', () => {
      const result = parseBlockResponse(`  \n  {"name": "Test"}  \n  `);
      expect(result).toEqual({ name: 'Test' });
    });

    it('should return null for invalid JSON', () => {
      const result = parseBlockResponse('This is not JSON at all');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseBlockResponse('');
      expect(result).toBeNull();
    });

    it('should handle nested JSON objects', () => {
      const result = parseBlockResponse(
        '{"name": "Wand", "properties": {"charges": 7}}',
      );
      expect(result).toEqual({ name: 'Wand', properties: { charges: 7 } });
    });

    it('should handle JSON with escaped strings', () => {
      const result = parseBlockResponse(
        '{"name": "Sword of \\"Power\\"", "description": "A mighty weapon"}',
      );
      expect(result).not.toBeNull();
      expect(result?.name).toBe('Sword of "Power"');
    });
  });
});
