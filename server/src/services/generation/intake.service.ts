import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { NormalizedInput, GenerationConstraints } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import {
  buildNormalizeInputSystemPrompt,
  buildNormalizeInputUserPrompt,
} from './prompts/normalize-input.prompt.js';

const NormalizedInputSchema = z.object({
  title: z.string(),
  summary: z.string(),
  inferredMode: z.enum(['one_shot', 'module', 'campaign', 'sourcebook']),
  tone: z.string(),
  themes: z.array(z.string()),
  setting: z.string(),
  premise: z.string(),
  levelRange: z.object({ min: z.number(), max: z.number() }).nullable(),
  pageTarget: z.number(),
  chapterEstimate: z.number(),
  constraints: z.object({
    strict5e: z.boolean(),
    includeHandouts: z.boolean(),
    includeMaps: z.boolean(),
  }),
  keyElements: z.object({
    npcs: z.array(z.string()),
    locations: z.array(z.string()),
    plotHooks: z.array(z.string()),
    items: z.array(z.string()),
  }),
});

export interface IntakeResult {
  normalizedInput: NormalizedInput;
  artifactId: string;
}

/**
 * Execute the intake normalization step.
 * Takes a GenerationRun with a freeform inputPrompt, calls AI to extract
 * structured data, creates a project_profile artifact, and updates the run.
 */
export async function executeIntake(
  run: { id: string; projectId: string; userId: string; inputPrompt: string; inputParameters: unknown },
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<IntakeResult> {
  const system = buildNormalizeInputSystemPrompt();
  const prompt = buildNormalizeInputUserPrompt(
    run.inputPrompt,
    run.inputParameters as GenerationConstraints | null,
  );

  const { text, usage } = await generateText({
    model,
    system,
    prompt,
    maxOutputTokens,
  });

  // Parse and validate the AI response
  const parsed = parseJsonResponse(text);
  const normalizedInput = NormalizedInputSchema.parse(parsed) as NormalizedInput;

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  // Create the project_profile artifact
  const artifact = await prisma.generatedArtifact.create({
    data: {
      runId: run.id,
      projectId: run.projectId,
      artifactType: 'project_profile',
      artifactKey: 'project-profile',
      status: 'accepted',
      version: 1,
      title: normalizedInput.title,
      summary: normalizedInput.summary,
      jsonContent: normalizedInput as any,
      tokenCount: totalTokens,
    },
  });

  // Update the run with inferred mode and estimates
  await prisma.generationRun.update({
    where: { id: run.id },
    data: {
      mode: normalizedInput.inferredMode,
      estimatedPages: normalizedInput.pageTarget,
      actualTokens: { increment: totalTokens },
    },
  });

  // Publish progress event
  await publishGenerationEvent(run.id, {
    type: 'artifact_created',
    runId: run.id,
    artifactId: artifact.id,
    artifactType: 'project_profile',
    title: normalizedInput.title,
    version: 1,
  });

  return { normalizedInput, artifactId: artifact.id };
}