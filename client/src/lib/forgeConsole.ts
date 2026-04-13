import type { ConsoleAgent } from '@dnd-booker/shared';

export type ConsoleChatTargetId = string | 'broadcast';
export type ConsoleMessageKind = 'user' | 'agent' | 'system';

export interface ConsoleMessage {
  id: string;
  kind: ConsoleMessageKind;
  text: string;
  timestamp: string;
  targetAgentId: ConsoleChatTargetId | null;
  fromAgentId: string | 'system' | null;
  fromLabel: string;
}

export function formatConsoleClock(date: Date) {
  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function buildConsoleSystemMessage(text: string): ConsoleMessage {
  return {
    id: crypto.randomUUID(),
    kind: 'system',
    text,
    timestamp: formatConsoleClock(new Date()),
    targetAgentId: null,
    fromAgentId: 'system',
    fromLabel: 'System',
  };
}

export function buildConsoleUserMessage(text: string, targetAgentId: ConsoleChatTargetId): ConsoleMessage {
  return {
    id: crypto.randomUUID(),
    kind: 'user',
    text,
    timestamp: formatConsoleClock(new Date()),
    targetAgentId,
    fromAgentId: null,
    fromLabel: 'You',
  };
}

export function buildConsoleAgentMessage(
  text: string,
  fromAgentId: string,
  fromLabel: string,
  targetAgentId: ConsoleChatTargetId,
): ConsoleMessage {
  return {
    id: crypto.randomUUID(),
    kind: 'agent',
    text,
    timestamp: formatConsoleClock(new Date()),
    targetAgentId,
    fromAgentId,
    fromLabel,
  };
}

export function filterConsoleMessages(messages: ConsoleMessage[], selectedTargetId: ConsoleChatTargetId) {
  if (selectedTargetId === 'broadcast') {
    return messages;
  }

  return messages.filter((message) => {
    if (message.kind === 'system') return true;
    if (message.targetAgentId === 'broadcast') {
      return message.kind === 'user' || message.fromAgentId === selectedTargetId;
    }
    return message.targetAgentId === selectedTargetId || message.fromAgentId === selectedTargetId;
  });
}

export function getActiveConsoleAgentCount(agents: ConsoleAgent[]) {
  return agents.filter((agent) => agent.status === 'working' || agent.status === 'waiting').length;
}

export function buildProjectWelcomeMessage(projectTitle: string) {
  return buildConsoleSystemMessage(`Welcome to the Forge for ${projectTitle}.`);
}
