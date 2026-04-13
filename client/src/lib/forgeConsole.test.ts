import { describe, expect, it } from 'vitest';
import {
  buildConsoleAgentMessage,
  buildConsoleSystemMessage,
  buildConsoleUserMessage,
  filterConsoleMessages,
  getActiveConsoleAgentCount,
} from './forgeConsole';

describe('forgeConsole helpers', () => {
  it('filters messages by selected agent while preserving system and relevant broadcast messages', () => {
    const messages = [
      buildConsoleSystemMessage('Welcome to the hall.'),
      buildConsoleUserMessage('Forge, report.', 'broadcast'),
      buildConsoleAgentMessage('Writer reply', 'writer', 'The Writer', 'broadcast'),
      buildConsoleAgentMessage('Critic reply', 'critic', 'The Critic', 'broadcast'),
      buildConsoleUserMessage('Writer, revise.', 'writer'),
      buildConsoleAgentMessage('Revision underway.', 'writer', 'The Writer', 'writer'),
    ];

    const filtered = filterConsoleMessages(messages, 'writer');

    expect(filtered).toHaveLength(5);
    expect(filtered.some((message) => message.kind === 'system')).toBe(true);
    expect(filtered.some((message) => message.fromAgentId === 'writer' && message.targetAgentId === 'broadcast')).toBe(true);
    expect(filtered.some((message) => message.fromAgentId === 'critic')).toBe(false);
  });

  it('counts working and waiting agents as active', () => {
    expect(getActiveConsoleAgentCount([
      {
        id: 'writer',
        name: 'The Writer',
        role: 'Story',
        iconKey: 'feather',
        status: 'working',
        currentTask: 'Drafting',
        progress: 30,
        queue: [],
        lastPing: 'just now',
      },
      {
        id: 'critic',
        name: 'The Critic',
        role: 'Review',
        iconKey: 'search',
        status: 'waiting',
        currentTask: 'Awaiting draft',
        progress: 0,
        queue: [],
        lastPing: '10s ago',
      },
      {
        id: 'printer',
        name: 'The Printer',
        role: 'PDF',
        iconKey: 'printer',
        status: 'idle',
        currentTask: null,
        progress: 0,
        queue: [],
        lastPing: '1m ago',
      },
    ])).toBe(2);
  });
});
