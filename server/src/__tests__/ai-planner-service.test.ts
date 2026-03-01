import { describe, it, expect } from 'vitest';
import { parseControlBlocks, stripControlBlocks, buildPlanningPromptSection } from '../services/ai-planner.service.js';
import type { PlanningState } from '@dnd-booker/shared';

describe('AI Planner Service', () => {
  describe('parseControlBlocks', () => {
    it('should extract _memoryUpdate blocks', () => {
      const response = `Here's what I think about your adventure.

\`\`\`json
{"_memoryUpdate": {"add": ["User wants a horror theme", "Party is level 5"], "drop": [0]}}
\`\`\``;

      const changes = parseControlBlocks(response);
      expect(changes.memoryUpdates).toHaveLength(1);
      expect(changes.memoryUpdates[0].add).toEqual(['User wants a horror theme', 'Party is level 5']);
      expect(changes.memoryUpdates[0].drop).toEqual([0]);
      expect(changes.planUpdates).toHaveLength(0);
      expect(changes.remembers).toHaveLength(0);
    });

    it('should extract _planUpdate blocks', () => {
      const response = `Let me plan this out.

\`\`\`json
{"_planUpdate": {"tasks": [{"id": "t1", "title": "Design dungeon map", "description": "Create the layout", "status": "pending", "dependsOn": []}]}}
\`\`\``;

      const changes = parseControlBlocks(response);
      expect(changes.planUpdates).toHaveLength(1);
      expect(changes.planUpdates[0].tasks).toHaveLength(1);
      expect(changes.planUpdates[0].tasks[0].title).toBe('Design dungeon map');
    });

    it('should extract _remember blocks', () => {
      const response = `Got it, I'll remember that.

\`\`\`json
{"_remember": {"type": "project_fact", "content": "The BBEG is a lich named Vecna", "scope": "project"}}
\`\`\``;

      const changes = parseControlBlocks(response);
      expect(changes.remembers).toHaveLength(1);
      expect(changes.remembers[0].type).toBe('project_fact');
      expect(changes.remembers[0].content).toBe('The BBEG is a lich named Vecna');
      expect(changes.remembers[0].scope).toBe('project');
    });

    it('should extract multiple control blocks from one response', () => {
      const response = `I've noted your preferences.

\`\`\`json
{"_memoryUpdate": {"add": ["Dark tone preferred"]}}
\`\`\`

\`\`\`json
{"_remember": {"type": "preference", "content": "Prefers dark tone", "scope": "global"}}
\`\`\``;

      const changes = parseControlBlocks(response);
      expect(changes.memoryUpdates).toHaveLength(1);
      expect(changes.remembers).toHaveLength(1);
    });

    it('should ignore non-control JSON blocks (stat blocks, wizardGenerate)', () => {
      const response = `Here is a stat block:

\`\`\`json
{"name": "Orc", "ac": 13, "hp": 15, "size": "Medium", "type": "Humanoid", "alignment": "Chaotic Evil"}
\`\`\`

\`\`\`json
{"_wizardGenerate": true, "adventureTitle": "Test", "summary": "Test", "sections": []}
\`\`\``;

      const changes = parseControlBlocks(response);
      expect(changes.memoryUpdates).toHaveLength(0);
      expect(changes.planUpdates).toHaveLength(0);
      expect(changes.remembers).toHaveLength(0);
    });

    it('should handle malformed JSON gracefully', () => {
      const response = `Here's some info.

\`\`\`json
{not valid json
\`\`\`

\`\`\`json
{"_memoryUpdate": {"add": ["valid bullet"]}}
\`\`\``;

      const changes = parseControlBlocks(response);
      expect(changes.memoryUpdates).toHaveLength(1);
      expect(changes.memoryUpdates[0].add).toEqual(['valid bullet']);
    });

    it('should return empty changes for responses with no control blocks', () => {
      const response = 'Just a regular response with no JSON blocks at all.';
      const changes = parseControlBlocks(response);
      expect(changes.memoryUpdates).toHaveLength(0);
      expect(changes.planUpdates).toHaveLength(0);
      expect(changes.remembers).toHaveLength(0);
    });
  });

  describe('stripControlBlocks', () => {
    it('should remove _memoryUpdate blocks from text', () => {
      const response = `Here's my answer.

\`\`\`json
{"_memoryUpdate": {"add": ["note"]}}
\`\`\``;

      const visible = stripControlBlocks(response);
      expect(visible).toBe("Here's my answer.");
      expect(visible).not.toContain('_memoryUpdate');
    });

    it('should remove _planUpdate blocks', () => {
      const response = `Planning done.

\`\`\`json
{"_planUpdate": {"tasks": []}}
\`\`\``;

      const visible = stripControlBlocks(response);
      expect(visible).toBe('Planning done.');
    });

    it('should remove _remember blocks', () => {
      const response = `Noted!

\`\`\`json
{"_remember": {"type": "preference", "content": "likes horror", "scope": "global"}}
\`\`\``;

      const visible = stripControlBlocks(response);
      expect(visible).toBe('Noted!');
    });

    it('should preserve non-control JSON blocks', () => {
      const response = `Here's a stat block:

\`\`\`json
{"name": "Orc", "ac": 13, "hp": 15}
\`\`\`

\`\`\`json
{"_memoryUpdate": {"add": ["generated orc"]}}
\`\`\``;

      const visible = stripControlBlocks(response);
      expect(visible).toContain('"name": "Orc"');
      expect(visible).not.toContain('_memoryUpdate');
    });

    it('should handle response with no control blocks (pass-through)', () => {
      const response = 'Just a plain text response.';
      const visible = stripControlBlocks(response);
      expect(visible).toBe('Just a plain text response.');
    });
  });

  describe('buildPlanningPromptSection', () => {
    it('should include section headers for empty state', () => {
      const context: PlanningState = {
        workingMemory: [],
        taskPlan: [],
        longTermMemory: [],
      };
      const section = buildPlanningPromptSection(context);
      expect(section).toContain('PLANNING ASSISTANT MODE');
      expect(section).toContain('END PLANNING ASSISTANT MODE');
      expect(section).not.toContain('WORKING MEMORY');
      expect(section).not.toContain('TASK PLAN');
      expect(section).not.toContain('LONG-TERM MEMORY');
    });

    it('should include working memory bullets', () => {
      const context: PlanningState = {
        workingMemory: ['User wants horror theme', 'Party is level 5'],
        taskPlan: [],
        longTermMemory: [],
      };
      const section = buildPlanningPromptSection(context);
      expect(section).toContain('WORKING MEMORY');
      expect(section).toContain('- User wants horror theme');
      expect(section).toContain('- Party is level 5');
    });

    it('should include task plan with status icons', () => {
      const context: PlanningState = {
        workingMemory: [],
        taskPlan: [
          { id: 't1', title: 'Design map', description: '', status: 'done', dependsOn: [] },
          { id: 't2', title: 'Write encounters', description: '', status: 'pending', dependsOn: [] },
          { id: 't3', title: 'Balance combat', description: '', status: 'blocked', dependsOn: ['t2'] },
        ],
        longTermMemory: [],
      };
      const section = buildPlanningPromptSection(context);
      expect(section).toContain('TASK PLAN');
      expect(section).toContain('[x] t1: Design map (done)');
      expect(section).toContain('[ ] t2: Write encounters (pending)');
      expect(section).toContain('[!] t3: Balance combat (blocked)');
      expect(section).toContain('(blocked by: t2)');
    });

    it('should include long-term memory with type and scope', () => {
      const context: PlanningState = {
        workingMemory: [],
        taskPlan: [],
        longTermMemory: [
          { id: '1', type: 'project_fact', content: 'Villain is a lich', confidence: 1, projectId: 'proj-1', source: null, createdAt: '' },
          { id: '2', type: 'preference', content: 'Dark tone', confidence: 1, projectId: null, source: null, createdAt: '' },
        ],
      };
      const section = buildPlanningPromptSection(context);
      expect(section).toContain('LONG-TERM MEMORY');
      expect(section).toContain('[project_fact|project] Villain is a lich');
      expect(section).toContain('[preference|global] Dark tone');
    });

    it('should include control block documentation', () => {
      const context: PlanningState = { workingMemory: [], taskPlan: [], longTermMemory: [] };
      const section = buildPlanningPromptSection(context);
      expect(section).toContain('_memoryUpdate');
      expect(section).toContain('_planUpdate');
      expect(section).toContain('_remember');
    });
  });
});
