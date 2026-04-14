import type {
  ConsoleAgent,
  ConsoleChatReply,
  QualityBudgetLane,
  AgentStage,
  GenerationRun,
  InterviewSession,
} from '@dnd-booker/shared';
import { prisma } from '../config/database.js';
import { buildDocumentOutline, buildDocumentTextSample } from './ai-content.service.js';
import { generateTextWithTimeout } from './generation/model-timeouts.js';
import { getInterviewSession } from './interview.service.js';
import { resolveSystemAgentLanguageModel } from './llm/system-router.js';
import { getCanonicalProjectContent } from './project-document-content.service.js';
import { listRuns } from './generation/run.service.js';

type ConsoleAgentDefinition = {
  id: string;
  name: string;
  role: string;
  iconKey: string;
  chatAgentKey: string;
  queue: string[];
};

const CONSOLE_AGENT_DEFINITIONS: ConsoleAgentDefinition[] = [
  {
    id: 'forgemaster',
    name: 'The Forgemaster',
    role: 'Orchestrator',
    iconKey: 'hammer',
    chatAgentKey: 'default',
    queue: ['Coordinate the autonomous run', 'Unblock the next specialist'],
  },
  {
    id: 'interviewer',
    name: 'The Interviewer',
    role: 'Brief & Intake',
    iconKey: 'radio',
    chatAgentKey: 'agent.interviewer',
    queue: ['Collect missing constraints', 'Lock the structured brief'],
  },
  {
    id: 'writer',
    name: 'The Writer',
    role: 'Story & Outline',
    iconKey: 'feather',
    chatAgentKey: 'agent.writer',
    queue: ['Draft the story packet', 'Apply critic rewrite notes'],
  },
  {
    id: 'dnd_expert',
    name: 'The D&D Expert',
    role: 'Encounters & Inserts',
    iconKey: 'scroll',
    chatAgentKey: 'agent.dnd_expert',
    queue: ['Generate insert bundles', 'Revise rules-heavy content'],
  },
  {
    id: 'layout_expert',
    name: 'The Layout Expert',
    role: 'Layout & Assembly',
    iconKey: 'columns',
    chatAgentKey: 'agent.layout_expert',
    queue: ['Assemble the first draft', 'Update placement and image briefs'],
  },
  {
    id: 'artist',
    name: 'The Artist',
    role: 'Illustration & Maps',
    iconKey: 'image',
    chatAgentKey: 'agent.artist_console',
    queue: ['Render requested images', 'Revise art direction from critic notes'],
  },
  {
    id: 'critic',
    name: 'The Critic',
    role: 'Layout, Lore & Quality',
    iconKey: 'search',
    chatAgentKey: 'agent.critic',
    queue: ['Score the next draft', 'Route rewrite notes back to the hall'],
  },
  {
    id: 'final_editor',
    name: 'The Editor',
    role: 'Final Editorial Polish',
    iconKey: 'pen',
    chatAgentKey: 'agent.final_editor',
    queue: ['Approve the final pass', 'Request one last targeted revision'],
  },
  {
    id: 'printer',
    name: 'The Printer',
    role: 'Final PDF & Delivery',
    iconKey: 'printer',
    chatAgentKey: 'agent.printer',
    queue: ['Validate the print manifest', 'Render the final PDF'],
  },
];

const AGENT_ORDER = [
  'interviewer',
  'writer',
  'dnd_expert',
  'layout_expert',
  'artist',
  'critic',
  'final_editor',
  'printer',
] as const;

const ACTIVE_RUN_STATUSES = new Set([
  'queued',
  'planning',
  'generating_assets',
  'generating_prose',
  'evaluating',
  'revising',
  'assembling',
]);

const AGENT_STAGE_TO_AGENT_ID: Partial<Record<AgentStage, string>> = {
  interview_locked: 'interviewer',
  writer_story_packet: 'writer',
  rewrite_writer: 'writer',
  dnd_expert_inserts: 'dnd_expert',
  rewrite_dnd_expert: 'dnd_expert',
  layout_first_draft: 'layout_expert',
  rewrite_layout: 'layout_expert',
  artist_requested: 'artist',
  artist_completed: 'artist',
  critic_text_pass: 'critic',
  critic_image_pass: 'critic',
  final_editor: 'final_editor',
  printer: 'printer',
};

function relativeTime(value: Date | string | null | undefined) {
  if (!value) return 'never';
  const date = value instanceof Date ? value : new Date(value);
  const deltaSeconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
  if (deltaSeconds < 5) return 'just now';
  if (deltaSeconds < 60) return `${deltaSeconds}s ago`;
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function truncate(value: string, max = 4000) {
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function isRetriableConsoleChatError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return error.name === 'AI_RetryError'
    || message.includes('high demand')
    || message.includes('try again later')
    || message.includes('temporarily unavailable')
    || message.includes('overloaded')
    || message.includes('rate limit')
    || message.includes('service unavailable');
}

function shouldFallbackConsoleReply(error: unknown) {
  if (!(error instanceof Error)) return false;
  if (isRetriableConsoleChatError(error)) return true;
  const message = error.message.toLowerCase();
  return message.includes('missing system-managed api key')
    || message.includes('missing system-managed')
    || message.includes('credentials')
    || message.includes('api key');
}

function getActiveStageAgent(run: GenerationRun | null) {
  if (!run?.agentStage) return null;
  return AGENT_STAGE_TO_AGENT_ID[run.agentStage] ?? null;
}

function getAgentOrderIndex(agentId: string) {
  return AGENT_ORDER.indexOf(agentId as (typeof AGENT_ORDER)[number]);
}

function describeRunStage(run: GenerationRun | null) {
  if (!run) return 'Awaiting a run.';
  switch (run.agentStage) {
    case 'interview_locked':
      return 'Brief locked and queued for autonomous generation.';
    case 'writer_story_packet':
      return 'Writing the story packet, plot hooks, cast, and chapter structure.';
    case 'dnd_expert_inserts':
      return 'Generating encounters, stat blocks, loot, handouts, and other inserts.';
    case 'layout_first_draft':
      return 'Arranging the draft, insert placement, and placeholder art briefs.';
    case 'artist_requested':
      return 'Dispatching image briefs to the artist.';
    case 'artist_completed':
      return 'Image generation completed and assets are ready for review.';
    case 'critic_text_pass':
      return `Running critic text pass${run.criticCycle ? ` for cycle ${run.criticCycle}` : ''}.`;
    case 'critic_image_pass':
      return `Running image-aware critic pass${run.criticCycle ? ` for cycle ${run.criticCycle}` : ''}.`;
    case 'rewrite_writer':
      return 'Routing rewrite notes back to the writer.';
    case 'rewrite_dnd_expert':
      return 'Routing rewrite notes back to the D&D expert.';
    case 'rewrite_layout':
      return 'Routing rewrite notes back to the layout expert.';
    case 'final_editor':
      return 'Running the final editorial polish pass.';
    case 'printer':
      return 'Preparing the print manifest and final PDF.';
    case 'completed':
      return 'Latest autonomous run completed cleanly.';
    case 'failed':
      return run.failureReason ?? 'Latest autonomous run failed.';
    default:
      return run.currentStage ? `Current run stage: ${run.currentStage}.` : 'Awaiting a run.';
  }
}

function describeAgentTask(
  definition: ConsoleAgentDefinition,
  run: GenerationRun | null,
  interview: InterviewSession | null,
  exportJob: { status: string; createdAt: Date; completedAt: Date | null } | null,
) {
  if (definition.id === 'forgemaster') {
    if (!run) {
      if (interview?.status === 'locked') return 'Brief locked and ready to launch.';
      if (interview) return 'Waiting for the interview brief to lock.';
      return null;
    }
    return describeRunStage(run);
  }

  if (definition.id === 'interviewer') {
    if (!interview) return null;
    if (interview.status === 'collecting') return 'Collecting campaign requirements and clarifying constraints.';
    if (interview.status === 'ready_to_lock') return 'Brief draft is ready to lock into structured JSON.';
    if (interview.status === 'locked') return run ? null : 'Brief locked and handed off to the writer.';
  }

  if (definition.id === 'artist') {
    if (run?.imageGenerationStatus === 'processing' || run?.imageGenerationStatus === 'requested') {
      return 'Generating images from the layout expert’s briefs.';
    }
    if (run?.imageGenerationStatus === 'failed') {
      return 'Last image batch failed validation or generation.';
    }
  }

  if (definition.id === 'critic' && run?.criticCycle && run.agentStage !== 'critic_text_pass' && run.agentStage !== 'critic_image_pass') {
    return `Waiting for revised draft inputs before critic cycle ${run.criticCycle + 1}.`;
  }

  if (definition.id === 'final_editor') {
    if (run?.finalEditorialStatus === 'rewrite_requested') {
      return 'Waiting for the final targeted rewrite before approval.';
    }
    if (run?.finalEditorialStatus === 'approved') {
      return null;
    }
  }

  if (definition.id === 'printer' && exportJob?.status === 'processing') {
    return 'Rendering the latest print PDF export.';
  }

  const activeAgentId = getActiveStageAgent(run);
  if (activeAgentId === definition.id) {
    return describeRunStage(run);
  }

  return null;
}

function buildConsoleAgent(
  definition: ConsoleAgentDefinition,
  run: GenerationRun | null,
  interview: InterviewSession | null,
  exportJob: { status: string; createdAt: Date; completedAt: Date | null } | null,
): ConsoleAgent {
  const activeAgentId = getActiveStageAgent(run);
  const activeIndex = activeAgentId ? getAgentOrderIndex(activeAgentId) : -1;
  const currentIndex = getAgentOrderIndex(definition.id);
  const activeRun = Boolean(run && ACTIVE_RUN_STATUSES.has(run.status));

  let status: ConsoleAgent['status'] = 'idle';
  let progress = 0;

  if (definition.id === 'forgemaster') {
    if (run?.status === 'failed') status = 'error';
    else if (run?.status === 'paused') status = 'waiting';
    else if (run && ACTIVE_RUN_STATUSES.has(run.status)) status = 'working';
    else if (!run && interview?.status && interview.status !== 'locked') status = 'waiting';
    progress = run?.status && ACTIVE_RUN_STATUSES.has(run.status) ? run.progressPercent : 0;
  } else if (definition.id === 'interviewer') {
    if (run && activeIndex >= 0) {
      status = currentIndex < activeIndex ? 'idle' : currentIndex === activeIndex ? 'working' : 'waiting';
    } else if (interview?.status === 'collecting') {
      status = 'working';
      progress = Math.min(100, Math.round((interview.turns.filter((turn) => turn.role === 'user').length / Math.max(interview.maxUserTurns, 1)) * 100));
    } else if (interview?.status === 'ready_to_lock') {
      status = 'waiting';
      progress = 100;
    } else if (interview?.status === 'locked') {
      status = 'idle';
    }
  } else if (run?.status === 'failed' && activeAgentId === definition.id) {
    status = 'error';
  } else if (definition.id === 'artist' && run?.imageGenerationStatus === 'failed') {
    status = 'error';
  } else if (definition.id === 'printer' && exportJob?.status === 'failed') {
    status = 'error';
  } else if (definition.id === 'artist' && (run?.imageGenerationStatus === 'processing' || run?.imageGenerationStatus === 'requested')) {
    status = 'working';
    progress = run.progressPercent;
  } else if (definition.id === 'printer' && exportJob?.status === 'processing') {
    status = 'working';
    progress = 100;
  } else if (definition.id === 'final_editor' && run?.finalEditorialStatus === 'rewrite_requested') {
    status = 'waiting';
  } else if (definition.id === 'critic' && run && activeRun && (run.agentStage === 'critic_text_pass' || run.agentStage === 'critic_image_pass')) {
    status = 'working';
    progress = run.progressPercent;
  } else if (activeRun && currentIndex >= 0) {
    if (activeAgentId === definition.id) {
      status = run?.status === 'paused' ? 'waiting' : 'working';
      progress = run?.progressPercent ?? 0;
    } else if (activeIndex > currentIndex) {
      status = 'idle';
    } else if (activeIndex >= 0 && currentIndex > activeIndex) {
      status = 'waiting';
    }
  }

  if (run?.status === 'paused' && activeAgentId === definition.id && definition.id !== 'forgemaster') {
    status = 'waiting';
  }

  const lastPingSource = definition.id === 'interviewer'
    ? interview?.updatedAt
    : definition.id === 'printer'
      ? exportJob?.completedAt ?? exportJob?.createdAt
      : run?.updatedAt ?? interview?.updatedAt ?? null;

  return {
    id: definition.id,
    name: definition.name,
    role: definition.role,
    iconKey: definition.iconKey,
    status,
    currentTask: status === 'idle' ? null : describeAgentTask(definition, run, interview, exportJob),
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    queue: definition.queue,
    lastPing: relativeTime(lastPingSource ?? null),
  };
}

function buildArtifactSummary(artifactCounts: Array<{ artifactType: string; _count: { artifactType: number } }>) {
  if (artifactCounts.length === 0) return 'No generated artifacts yet.';
  return artifactCounts
    .sort((left, right) => right._count.artifactType - left._count.artifactType)
    .slice(0, 8)
    .map((entry) => `${entry.artifactType}: ${entry._count.artifactType}`)
    .join(', ');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function describeArtifactRecord(artifact: {
  title: string | null;
  summary: string | null;
} | null | undefined) {
  if (!artifact) return 'none';
  const title = artifact.title?.trim() || 'untitled';
  const summary = artifact.summary?.trim();
  return summary ? `${title}: ${summary}` : title;
}

function buildRewriteSummary(run: GenerationRun | null) {
  if (!run?.routedRewriteCounts) return 'none';
  return `writer=${run.routedRewriteCounts.writer}, dnd=${run.routedRewriteCounts.dndExpert}, layout=${run.routedRewriteCounts.layoutExpert}, artist=${run.routedRewriteCounts.artist}`;
}

function summarizeCriticReport(artifact: { jsonContent: unknown } | null | undefined) {
  const record = asRecord(artifact?.jsonContent);
  if (!record) return 'none';
  const overallScore = typeof record.overallScore === 'number' ? record.overallScore : null;
  const blockingFindingCount = typeof record.blockingFindingCount === 'number' ? record.blockingFindingCount : 0;
  const majorFindingCount = typeof record.majorFindingCount === 'number' ? record.majorFindingCount : 0;
  const passed = record.passed === true ? 'passed' : 'not passed';
  return `critic ${passed}; score=${overallScore ?? 'n/a'}; blocking=${blockingFindingCount}; major=${majorFindingCount}`;
}

function summarizeAssemblyManifest(manifest: {
  version: number;
  status: string;
  documents: unknown;
} | null | undefined) {
  if (!manifest) return 'none';
  const documentCount = Array.isArray(manifest.documents) ? manifest.documents.length : 0;
  return `version ${manifest.version}, ${documentCount} document${documentCount === 1 ? '' : 's'}, status=${manifest.status}`;
}

function buildConsoleSystemPrompt(definition: ConsoleAgentDefinition, context: {
  projectTitle: string;
  projectType: string;
  projectDescription: string;
  documentOutline: string | null;
  documentTextSample: string | null;
  interview: InterviewSession | null;
  run: GenerationRun | null;
  exportStatus: string | null;
  artifactSummary: string;
  writerStoryPacketSummary: string;
  layoutDraftSummary: string;
  imageBriefSummary: string;
  assemblySummary: string;
  criticSummary: string;
}) {
  return [
    `You are ${definition.name}, the ${definition.role.toLowerCase()} agent in DND Booker.`,
    'You are replying inside an operator console for an internal publishing workflow.',
    'Respond in first person, keep it concise, concrete, and operational.',
    'Do not fabricate work that has not happened. Base your answer on the provided project and run context.',
    'If asked for status, report what you are doing, what is blocked, and the next useful step.',
    'If asked for direction, answer as that specialist, not as a general assistant.',
    'Keep the reply under 120 words and avoid markdown bullets unless the operator explicitly asks for a list.',
    '',
    `Project: ${context.projectTitle} (${context.projectType})`,
    `Description: ${context.projectDescription || 'No project description.'}`,
    `Interview status: ${context.interview?.status ?? 'none'}`,
    `Locked brief summary: ${context.interview?.lockedBrief?.summary ?? context.interview?.briefDraft?.summary ?? 'none'}`,
    `Generation status: ${context.run?.status ?? 'none'}`,
    `Agent stage: ${context.run?.agentStage ?? 'none'}`,
    `Current stage: ${context.run?.currentStage ?? 'none'}`,
    `Critic cycle: ${context.run?.criticCycle ?? 0}`,
    `Image generation status: ${context.run?.imageGenerationStatus ?? 'not_requested'}`,
    `Final editorial status: ${context.run?.finalEditorialStatus ?? 'pending'}`,
    `Routed rewrites: ${buildRewriteSummary(context.run)}`,
    `Export status: ${context.exportStatus ?? 'none'}`,
    `Artifacts: ${context.artifactSummary}`,
    `Writer story packet: ${context.writerStoryPacketSummary}`,
    `Layout draft: ${context.layoutDraftSummary}`,
    `Image briefs: ${context.imageBriefSummary}`,
    `Assembly: ${context.assemblySummary}`,
    `Critic: ${context.criticSummary}`,
    `Document outline: ${context.documentOutline ?? 'No outline yet.'}`,
    `Document text sample: ${context.documentTextSample ?? 'No prose draft yet.'}`,
  ].join('\n');
}

function buildFallbackReply(definition: ConsoleAgentDefinition, context: {
  interview: InterviewSession | null;
  run: GenerationRun | null;
  exportStatus: string | null;
  writerStoryPacketSummary: string;
  layoutDraftSummary: string;
  imageBriefSummary: string;
  criticSummary: string;
}) {
  if (definition.id === 'interviewer') {
    if (context.interview?.status === 'locked') {
      return 'The brief is already locked. I do not need more intake unless you want to revise the request and relock it.';
    }
    return `I can keep gathering constraints. Current interview status is ${context.interview?.status ?? 'not started'}.`;
  }

  if (definition.id === 'writer') {
    return `Writer lane is ${context.run?.agentStage === 'writer_story_packet' || context.run?.agentStage === 'rewrite_writer' ? 'active' : 'waiting'}. Story packet: ${context.writerStoryPacketSummary}.`;
  }

  if (definition.id === 'dnd_expert') {
    return `Insert and rules lane is tracking routed findings ${buildRewriteSummary(context.run)}. Latest autonomous stage is ${context.run?.agentStage ?? 'not started'}.`;
  }

  if (definition.id === 'layout_expert') {
    return `Layout is tracking ${context.layoutDraftSummary}. Image briefs: ${context.imageBriefSummary}.`;
  }

  if (definition.id === 'artist') {
    return `Image generation is ${context.run?.imageGenerationStatus ?? 'not requested'} right now.`;
  }

  if (definition.id === 'critic') {
    return `Critic cycle is ${context.run?.criticCycle ?? 0}. ${context.criticSummary}.`;
  }

  if (definition.id === 'final_editor') {
    return `Final editorial status is ${context.run?.finalEditorialStatus ?? 'pending'}.`;
  }

  if (definition.id === 'printer') {
    return `Print/export status is ${context.exportStatus ?? 'not started'}.`;
  }

  return `The hall is synchronized. Latest generation status is ${context.run?.status ?? 'idle'} at stage ${context.run?.agentStage ?? 'none'}.`;
}

async function generateConsoleReply(
  definition: ConsoleAgentDefinition,
  operatorMessage: string,
  context: {
    projectTitle: string;
    projectType: string;
    projectDescription: string;
    documentOutline: string | null;
    documentTextSample: string | null;
    interview: InterviewSession | null;
    run: GenerationRun | null;
    exportStatus: string | null;
    artifactSummary: string;
    writerStoryPacketSummary: string;
    layoutDraftSummary: string;
    imageBriefSummary: string;
    assemblySummary: string;
    criticSummary: string;
    qualityBudgetLane: QualityBudgetLane;
  },
): Promise<ConsoleChatReply> {
  try {
    const { model, maxOutputTokens } = await resolveSystemAgentLanguageModel(
      definition.chatAgentKey,
      context.qualityBudgetLane,
    );
    const result = await generateTextWithTimeout(`Console chat for ${definition.id}`, {
      model,
      system: buildConsoleSystemPrompt(definition, context),
      prompt: `Operator message:\n${operatorMessage}`,
      maxOutputTokens: Math.min(maxOutputTokens, 512),
    }, 90_000);

    return {
      fromAgentId: definition.id,
      fromLabel: definition.name,
      reply: truncate(result.text || buildFallbackReply(definition, context)),
      responseMode: 'model',
    };
  } catch (error) {
    if (!shouldFallbackConsoleReply(error)) {
      throw error;
    }

    console.warn(`[forge-console] Falling back to deterministic reply for ${definition.id}:`, error);
    return {
      fromAgentId: definition.id,
      fromLabel: definition.name,
      reply: buildFallbackReply(definition, context),
      responseMode: 'fallback',
    };
  }
}

export async function listForgeConsoleAgents(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) return null;

  const [interview, runs, exportJob] = await Promise.all([
    getInterviewSession(projectId, userId),
    listRuns(projectId, userId),
    prisma.exportJob.findFirst({
      where: { projectId, userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true, completedAt: true },
    }),
  ]);

  const run = runs?.[0] ?? null;
  return CONSOLE_AGENT_DEFINITIONS.map((definition) => buildConsoleAgent(definition, run, interview, exportJob));
}

export async function sendForgeConsoleMessage(
  projectId: string,
  userId: string,
  agentId: string,
  message: string,
) {
  const project = await getCanonicalProjectContent(projectId, userId);
  if (!project) return null;

  const [interview, runs, exportJob] = await Promise.all([
    getInterviewSession(projectId, userId),
    listRuns(projectId, userId),
    prisma.exportJob.findFirst({
      where: { projectId, userId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true, completedAt: true },
    }),
  ]);

  const run = runs?.[0] ?? null;
  const artifactWhere = run ? { runId: run.id, projectId } : { projectId };
  const [
    artifactCounts,
    writerStoryPacket,
    layoutDraft,
    imageBriefBundle,
    criticReport,
    assemblyManifest,
  ] = await Promise.all([
    prisma.generatedArtifact.groupBy({
      by: ['artifactType'],
      where: artifactWhere,
      _count: { artifactType: true },
    }),
    prisma.generatedArtifact.findFirst({
      where: { ...artifactWhere, artifactType: 'writer_story_packet' },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { title: true, summary: true },
    }),
    prisma.generatedArtifact.findFirst({
      where: { ...artifactWhere, artifactType: 'layout_draft' },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { title: true, summary: true },
    }),
    prisma.generatedArtifact.findFirst({
      where: { ...artifactWhere, artifactType: 'image_brief_bundle' },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { title: true, summary: true },
    }),
    prisma.generatedArtifact.findFirst({
      where: { ...artifactWhere, artifactType: 'critic_report' },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { jsonContent: true, title: true, summary: true },
    }),
    prisma.assemblyManifest.findFirst({
      where: artifactWhere,
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { version: true, status: true, documents: true },
    }),
  ]);
  const context = {
    projectTitle: project.project.title,
    projectType: project.project.type,
    projectDescription: project.project.description ?? '',
    documentOutline: buildDocumentOutline(project.content),
    documentTextSample: buildDocumentTextSample(project.content),
    interview,
    run,
    exportStatus: exportJob?.status ?? null,
    artifactSummary: buildArtifactSummary(artifactCounts),
    writerStoryPacketSummary: describeArtifactRecord(writerStoryPacket),
    layoutDraftSummary: describeArtifactRecord(layoutDraft),
    imageBriefSummary: describeArtifactRecord(imageBriefBundle),
    assemblySummary: summarizeAssemblyManifest(assemblyManifest),
    criticSummary: summarizeCriticReport(criticReport),
    qualityBudgetLane: run?.qualityBudgetLane ?? interview?.lockedBrief?.qualityBudgetLane ?? 'balanced',
  } satisfies {
    projectTitle: string;
    projectType: string;
    projectDescription: string;
    documentOutline: string | null;
    documentTextSample: string | null;
    interview: InterviewSession | null;
    run: GenerationRun | null;
    exportStatus: string | null;
    artifactSummary: string;
    writerStoryPacketSummary: string;
    layoutDraftSummary: string;
    imageBriefSummary: string;
    assemblySummary: string;
    criticSummary: string;
    qualityBudgetLane: QualityBudgetLane;
  };

  if (agentId === 'broadcast') {
    const agents = await listForgeConsoleAgents(projectId, userId);
    const responders = (agents ?? [])
      .filter((agent) => agent.id !== 'interviewer' && agent.id !== 'printer')
      .filter((agent) => agent.status !== 'idle')
      .slice(0, 4)
      .map((agent) => CONSOLE_AGENT_DEFINITIONS.find((definition) => definition.id === agent.id))
      .filter((definition): definition is ConsoleAgentDefinition => Boolean(definition));

    const fallbackResponders = responders.length > 0
      ? responders
      : [CONSOLE_AGENT_DEFINITIONS[0]!, CONSOLE_AGENT_DEFINITIONS[2]!, CONSOLE_AGENT_DEFINITIONS[6]!];

    return Promise.all(fallbackResponders.map((definition) => generateConsoleReply(definition, message, context)));
  }

  const definition = CONSOLE_AGENT_DEFINITIONS.find((entry) => entry.id === agentId);
  if (!definition) {
    throw new Error('Unknown console agent.');
  }

  const reply = await generateConsoleReply(definition, message, context);
  return [reply];
}
