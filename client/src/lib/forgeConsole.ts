import type { ConsoleAgent, ConsoleChatReply, InterviewSession } from '@dnd-booker/shared';

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
  responseMode: ConsoleChatReply['responseMode'] | null;
}

export function formatConsoleClock(date: Date) {
  return new Intl.DateTimeFormat([], {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function buildConsoleSystemMessage(
  text: string,
  targetAgentId: ConsoleChatTargetId | null = null,
): ConsoleMessage {
  return {
    id: crypto.randomUUID(),
    kind: 'system',
    text,
    timestamp: formatConsoleClock(new Date()),
    targetAgentId,
    fromAgentId: 'system',
    fromLabel: 'System',
    responseMode: null,
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
    responseMode: null,
  };
}

export function buildConsoleAgentMessage(
  text: string,
  fromAgentId: string,
  fromLabel: string,
  targetAgentId: ConsoleChatTargetId,
  responseMode: ConsoleChatReply['responseMode'] | null = null,
): ConsoleMessage {
  return {
    id: crypto.randomUUID(),
    kind: 'agent',
    text,
    timestamp: formatConsoleClock(new Date()),
    targetAgentId,
    fromAgentId,
    fromLabel,
    responseMode,
  };
}

export function buildInterviewThreadMessages(
  session: InterviewSession | null,
  interviewerLabel = 'The Interviewer',
): ConsoleMessage[] {
  if (!session) return [];

  return session.turns.map((turn) => ({
    id: turn.id,
    kind: turn.role === 'user' ? 'user' : 'agent',
    text: turn.content,
    timestamp: formatConsoleClock(new Date(turn.createdAt)),
    targetAgentId: 'interviewer',
    fromAgentId: turn.role === 'assistant' ? 'interviewer' : null,
    fromLabel: turn.role === 'assistant' ? interviewerLabel : 'You',
    responseMode: null,
  }));
}

export function filterConsoleMessages(messages: ConsoleMessage[], selectedTargetId: ConsoleChatTargetId) {
  if (selectedTargetId === 'broadcast') {
    return messages;
  }

  return messages.filter((message) => {
    if (message.kind === 'system') {
      if (message.targetAgentId === null) return true;
      if (selectedTargetId === 'broadcast') {
        return message.targetAgentId === 'broadcast';
      }
      return message.targetAgentId === selectedTargetId;
    }
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
