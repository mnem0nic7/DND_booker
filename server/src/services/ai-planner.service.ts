import * as aiMemory from './ai-memory.service.js';
import type {
  PlanningState,
  PlanningStateChanges,
  MemoryItem,
  PlanTask,
} from '@dnd-booker/shared';

// --- Context Loading ---

export async function buildPlanningContext(
  projectId: string,
  userId: string,
): Promise<PlanningState> {
  const [workingMemory, taskPlan, memoryItems] = await Promise.all([
    aiMemory.getWorkingMemory(projectId, userId),
    aiMemory.getTaskPlan(projectId, userId),
    aiMemory.getMemoryItems(userId, projectId),
  ]);

  const longTermMemory: MemoryItem[] = memoryItems.map((m) => ({
    id: m.id,
    type: m.type as MemoryItem['type'],
    content: m.content,
    confidence: m.confidence,
    projectId: m.projectId,
    source: m.source,
    createdAt: m.createdAt.toISOString(),
  }));

  return { workingMemory, taskPlan, longTermMemory };
}

// --- Prompt Building ---

export function buildPlanningPromptSection(context: PlanningState): string {
  const sections: string[] = [];

  sections.push('\n=== PLANNING ASSISTANT MODE ===');

  // Working memory
  if (context.workingMemory.length > 0) {
    sections.push('WORKING MEMORY (rolling summary of our conversation):');
    context.workingMemory.forEach((b) => sections.push(`- ${b}`));
  }

  // Task plan
  if (context.taskPlan.length > 0) {
    sections.push('\nTASK PLAN:');
    context.taskPlan.forEach((t) => {
      const icon = t.status === 'done' ? '[x]' : t.status === 'blocked' ? '[!]' : t.status === 'in_progress' ? '[~]' : '[ ]';
      const deps = t.dependsOn.length > 0 ? ` (blocked by: ${t.dependsOn.join(', ')})` : '';
      sections.push(`- ${icon} ${t.id}: ${t.title} (${t.status})${deps}`);
      if (t.notes) sections.push(`  Notes: ${t.notes}`);
    });
  }

  // Long-term memory
  if (context.longTermMemory.length > 0) {
    sections.push('\nLONG-TERM MEMORY:');
    context.longTermMemory.forEach((m) => {
      const scope = m.projectId ? 'project' : 'global';
      sections.push(`- [${m.type}|${scope}] ${m.content}`);
    });
  }

  sections.push(`
INSTRUCTIONS: After your response, you MAY include one or more JSON control blocks in \`\`\`json fences to update your planning state. These are OPTIONAL — only include them when you have meaningful state changes.

Available control blocks:

1. Working Memory update (rolling summary — add new insights, drop stale ones):
\`\`\`json
{"_memoryUpdate": {"add": ["new bullet point"], "drop": [0, 3]}}
\`\`\`
- "add" appends new bullets (max 20 total)
- "drop" removes bullets by index (0-based, from current working memory list above)

2. Task Plan update (replace the entire task list):
\`\`\`json
{"_planUpdate": {"tasks": [{"id": "t1", "title": "...", "description": "...", "status": "pending", "dependsOn": []}]}}
\`\`\`
- status: pending | in_progress | done | blocked
- dependsOn: array of task ids this task depends on

3. Remember a fact long-term (persists across conversations):
\`\`\`json
{"_remember": {"type": "project_fact", "content": "The main villain is a lich named Vecna", "scope": "project"}}
\`\`\`
- type: preference | project_fact | constraint | decision | glossary
- scope: "project" (this adventure) or "global" (all projects for this user)

RULES:
- Control blocks MUST come AFTER your visible response text
- Multiple control blocks are allowed in separate \`\`\`json fences
- Only emit control blocks when you genuinely have state to update — most responses need none
- When the user tells you a fact or preference, use _remember to store it
- Use _memoryUpdate to maintain a rolling summary of the conversation's key points
- Use _planUpdate when discussing or planning multi-step tasks
=== END PLANNING ASSISTANT MODE ===`);

  return sections.join('\n');
}

// --- Response Parsing ---

const CONTROL_BLOCK_PATTERN = /```(?:json)?\s*([\s\S]*?)```/g;

export function parseControlBlocks(responseText: string): PlanningStateChanges {
  const changes: PlanningStateChanges = {
    memoryUpdates: [],
    planUpdates: [],
    remembers: [],
  };

  let match: RegExpExecArray | null;
  const regex = new RegExp(CONTROL_BLOCK_PATTERN.source, CONTROL_BLOCK_PATTERN.flags);

  while ((match = regex.exec(responseText)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (!parsed || typeof parsed !== 'object') continue;

      if (parsed._memoryUpdate) {
        changes.memoryUpdates.push(parsed._memoryUpdate);
      } else if (parsed._planUpdate) {
        changes.planUpdates.push(parsed._planUpdate);
      } else if (parsed._remember) {
        changes.remembers.push(parsed._remember);
      }
      // Other JSON blocks (e.g., _wizardGenerate, stat blocks) are ignored
    } catch {
      // Not valid JSON or not a control block — skip
    }
  }

  return changes;
}

export function stripControlBlocks(responseText: string): string {
  return responseText.replace(
    /```(?:json)?\s*([\s\S]*?)```/g,
    (fullMatch, inner: string) => {
      try {
        const parsed = JSON.parse(inner.trim());
        if (parsed && typeof parsed === 'object' && (
          parsed._memoryUpdate || parsed._planUpdate || parsed._remember
        )) {
          return '';
        }
      } catch {
        // Not a control block
      }
      return fullMatch;
    },
  ).trim();
}

// --- State Application ---

export async function processAssistantResponse(
  responseText: string,
  projectId: string,
  userId: string,
): Promise<{ visibleText: string; stateChanges: PlanningStateChanges }> {
  const stateChanges = parseControlBlocks(responseText);
  const visibleText = stripControlBlocks(responseText);

  // Apply working memory updates
  for (const update of stateChanges.memoryUpdates) {
    let bullets = await aiMemory.getWorkingMemory(projectId, userId);

    // Drop bullets by index (process in reverse order to maintain index validity)
    if (update.drop && Array.isArray(update.drop)) {
      const sortedDrops = [...update.drop]
        .filter((i) => typeof i === 'number' && i >= 0 && i < bullets.length)
        .sort((a, b) => b - a);
      for (const idx of sortedDrops) {
        bullets.splice(idx, 1);
      }
    }

    // Add new bullets
    if (update.add && Array.isArray(update.add)) {
      const newBullets = update.add.filter((b): b is string => typeof b === 'string');
      bullets = [...bullets, ...newBullets];
    }

    await aiMemory.saveWorkingMemory(projectId, userId, bullets);
  }

  // Apply task plan updates (last one wins if multiple)
  for (const update of stateChanges.planUpdates) {
    if (Array.isArray(update.tasks)) {
      const validTasks: PlanTask[] = update.tasks
        .slice(0, 50) // Cap at 50 tasks to prevent bloat
        .filter((t): t is PlanTask =>
          t && typeof t === 'object' &&
          typeof t.id === 'string' &&
          typeof t.title === 'string',
        )
        .map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description || '',
          status: (['pending', 'in_progress', 'done', 'blocked'].includes(t.status)
            ? t.status
            : 'pending') as PlanTask['status'],
          dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn : [],
          acceptanceCriteria: t.acceptanceCriteria,
          notes: t.notes,
        }));
      await aiMemory.saveTaskPlan(projectId, userId, validTasks);
    }
  }

  // Apply long-term memory items
  for (const remember of stateChanges.remembers) {
    if (typeof remember.content !== 'string' || !remember.content.trim()) continue;
    const validTypes = ['preference', 'project_fact', 'constraint', 'decision', 'glossary'];
    const type = validTypes.includes(remember.type) ? remember.type : 'project_fact';

    await aiMemory.addMemoryItem(userId, {
      type,
      content: remember.content.trim(),
      projectId: remember.scope === 'global' ? null : projectId,
      source: 'ai-chat',
    });
  }

  return { visibleText, stateChanges };
}
