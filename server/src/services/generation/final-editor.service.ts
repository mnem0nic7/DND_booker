import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { EditorialDecision } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { generateObjectWithTimeout } from './model-timeouts.js';
import { publishGenerationEvent } from './pubsub.service.js';

const EditorialDecisionSchema = z.object({
  approved: z.boolean(),
  summary: z.string().min(1).max(2000),
  targetedRewriteOwner: z.enum(['writer', 'dnd_expert', 'layout_expert', 'artist']).nullable(),
  notes: z.array(z.string().min(1).max(1000)).max(8),
});

function buildSystemPrompt() {
  return `You are the final editor agent for a D&D publication pipeline.

Review the current critic/export state and decide whether the draft is ready for print.

Rules:
- Approve only if the product is coherent, polished, and print-ready.
- If one final targeted rewrite is needed, assign exactly one owner.
- Do not request broad speculative rewrites.
- Focus on cohesion, tone, copy quality, pacing, and print readiness.
- Return only the structured decision.`;
}

function buildPrompt(input: {
  title: string;
  criticReport: unknown;
  exportReview: unknown;
}) {
  return [
    `Project title: ${input.title}`,
    `Latest critic report:\n${JSON.stringify(input.criticReport, null, 2)}`,
    `Latest export review:\n${JSON.stringify(input.exportReview, null, 2)}`,
  ].join('\n\n');
}

export async function executeFinalEditorReview(
  run: {
    id: string;
    projectId: string;
    title: string;
  },
  criticReport: unknown,
  exportReview: unknown,
  model: LanguageModel,
  maxOutputTokens: number,
) {
  const existing = await prisma.generatedArtifact.findFirst({
    where: {
      runId: run.id,
      artifactType: 'editor_report',
      artifactKey: 'editor-report',
    },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, version: true },
  });

  const { object, usage } = await generateObjectWithTimeout('Final editor review', {
    model,
    system: buildSystemPrompt(),
    prompt: buildPrompt({
      title: run.title,
      criticReport,
      exportReview,
    }),
    schema: EditorialDecisionSchema,
    maxOutputTokens: Math.min(maxOutputTokens, 2048),
  });

  const decision = EditorialDecisionSchema.parse(object) as EditorialDecision;
  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'editor_report',
      artifactKey: 'editor-report',
      status: 'accepted',
      version: (existing?.version ?? 0) + 1,
      title: 'Final Editor Report',
      summary: decision.summary,
      jsonContent: decision as any,
      tokenCount: totalTokens,
      parentArtifactId: existing?.id ?? null,
    },
  });

  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'editor_report',
    title: artifact.title,
    version: artifact.version,
  });

  return {
    artifactId: artifact.id,
    decision,
  };
}
