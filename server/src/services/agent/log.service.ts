import type {
  AgentAction,
  AgentActionStatus,
  AgentActionType,
  AgentDecision,
  AgentDecisionType,
  AgentObservation,
  AgentObservationType,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';

function serializeAction(action: any): AgentAction {
  return {
    id: action.id,
    runId: action.runId,
    cycleIndex: action.cycleIndex,
    actionType: action.actionType,
    status: action.status,
    rationale: action.rationale ?? null,
    input: action.inputJson ?? null,
    result: action.resultJson ?? null,
    scoreDelta: typeof action.scoreDelta === 'number' ? action.scoreDelta : null,
    startedAt: action.startedAt?.toISOString() ?? null,
    completedAt: action.completedAt?.toISOString() ?? null,
    createdAt: action.createdAt.toISOString(),
  };
}

function serializeObservation(observation: any): AgentObservation {
  return {
    id: observation.id,
    runId: observation.runId,
    cycleIndex: observation.cycleIndex,
    observationType: observation.observationType,
    summary: observation.summary,
    payload: observation.payloadJson ?? null,
    createdAt: observation.createdAt.toISOString(),
  };
}

function serializeDecision(decision: any): AgentDecision {
  return {
    id: decision.id,
    runId: decision.runId,
    cycleIndex: decision.cycleIndex,
    decisionType: decision.decisionType,
    chosenActionType: decision.chosenActionType ?? null,
    rationale: decision.rationale,
    payload: decision.payloadJson ?? null,
    createdAt: decision.createdAt.toISOString(),
  };
}

export async function createAgentAction(input: {
  runId: string;
  cycleIndex: number;
  actionType: AgentActionType;
  rationale?: string | null;
  input?: unknown | null;
}) {
  const action = await prisma.agentAction.create({
    data: {
      runId: input.runId,
      cycleIndex: input.cycleIndex,
      actionType: input.actionType,
      rationale: input.rationale ?? null,
      inputJson: input.input as any,
      status: 'queued',
    },
  });

  return serializeAction(action);
}

export async function startAgentAction(actionId: string) {
  const action = await prisma.agentAction.update({
    where: { id: actionId },
    data: {
      status: 'running',
      startedAt: new Date(),
    },
  });
  return serializeAction(action);
}

export async function completeAgentAction(input: {
  actionId: string;
  status?: Exclude<AgentActionStatus, 'queued' | 'running'>;
  result?: unknown | null;
  scoreDelta?: number | null;
}) {
  const action = await prisma.agentAction.update({
    where: { id: input.actionId },
    data: {
      status: input.status ?? 'completed',
      resultJson: input.result as any,
      scoreDelta: input.scoreDelta ?? null,
      completedAt: new Date(),
    },
  });
  return serializeAction(action);
}

export async function listAgentActions(runId: string, userId: string): Promise<AgentAction[] | null> {
  const run = await prisma.agentRun.findFirst({
    where: { id: runId, userId },
    select: { id: true },
  });
  if (!run) return null;

  const actions = await prisma.agentAction.findMany({
    where: { runId },
    orderBy: [{ cycleIndex: 'desc' }, { createdAt: 'desc' }],
  });
  return actions.map(serializeAction);
}

export async function createAgentObservation(input: {
  runId: string;
  cycleIndex: number;
  observationType: AgentObservationType;
  summary: string;
  payload?: unknown | null;
}) {
  const observation = await prisma.agentObservation.create({
    data: {
      runId: input.runId,
      cycleIndex: input.cycleIndex,
      observationType: input.observationType,
      summary: input.summary,
      payloadJson: input.payload as any,
    },
  });
  return serializeObservation(observation);
}

export async function createAgentDecision(input: {
  runId: string;
  cycleIndex: number;
  decisionType: AgentDecisionType;
  chosenActionType?: AgentActionType | null;
  rationale: string;
  payload?: unknown | null;
}) {
  const decision = await prisma.agentDecision.create({
    data: {
      runId: input.runId,
      cycleIndex: input.cycleIndex,
      decisionType: input.decisionType,
      chosenActionType: input.chosenActionType ?? null,
      rationale: input.rationale,
      payloadJson: input.payload as any,
    },
  });
  return serializeDecision(decision);
}
