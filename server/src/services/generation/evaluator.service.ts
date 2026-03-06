import { generateText, type LanguageModel } from 'ai';
import { z } from 'zod';
import type { BibleContent, EvaluationFinding, EvaluationWeights, AcceptanceThreshold } from '@dnd-booker/shared';
import { EVALUATION_WEIGHTS, ACCEPTANCE_THRESHOLDS } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import {
  buildEvaluateArtifactSystemPrompt,
  buildEvaluateArtifactUserPrompt,
} from './prompts/evaluate-artifact.prompt.js';

const FindingSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor', 'informational']),
  code: z.string(),
  message: z.string(),
  affectedScope: z.string(),
  suggestedFix: z.string().optional(),
});

const EvaluationResponseSchema = z.object({
  structuralCompleteness: z.number(),
  continuityScore: z.number(),
  dndSanity: z.number(),
  editorialQuality: z.number(),
  publicationFit: z.number(),
  findings: z.array(FindingSchema),
  recommendedActions: z.array(z.string()),
});

const ARTIFACT_CATEGORY: Record<string, string> = {
  project_profile: 'planning',
  campaign_bible: 'planning',
  chapter_outline: 'planning',
  chapter_plan: 'planning',
  npc_dossier: 'reference',
  location_brief: 'reference',
  faction_profile: 'reference',
  encounter_bundle: 'reference',
  item_bundle: 'reference',
  chapter_draft: 'written',
  appendix_draft: 'written',
  front_matter_draft: 'written',
};

export interface EvaluationResult {
  evaluationId: string;
  overallScore: number;
  passed: boolean;
  findings: EvaluationFinding[];
  recommendedActions: string[];
}

/**
 * Get the evaluation category for an artifact type.
 */
export function getArtifactCategory(artifactType: string): string {
  return ARTIFACT_CATEGORY[artifactType] ?? 'written';
}

/**
 * Calculate the weighted overall score from dimension scores.
 */
export function calculateOverallScore(
  dimensions: {
    structuralCompleteness: number;
    continuityScore: number;
    dndSanity: number;
    editorialQuality: number;
    publicationFit: number;
  },
  weights: EvaluationWeights,
): number {
  return Math.round(
    dimensions.structuralCompleteness * weights.structuralCompleteness +
    dimensions.continuityScore * weights.continuity +
    dimensions.dndSanity * weights.dndSanity +
    dimensions.editorialQuality * weights.editorialQuality +
    dimensions.publicationFit * weights.publicationFit,
  );
}

/**
 * Determine if an evaluation passes based on acceptance thresholds.
 */
export function checkAcceptance(
  dimensions: {
    structuralCompleteness: number;
    continuityScore: number;
    publicationFit: number;
  },
  overallScore: number,
  threshold: AcceptanceThreshold,
  findings: EvaluationFinding[],
): boolean {
  // Any critical finding = automatic fail
  if (findings.some((f) => f.severity === 'critical')) return false;

  if (overallScore < threshold.overall) return false;
  if (threshold.continuity && dimensions.continuityScore < threshold.continuity) return false;
  if (threshold.structural && dimensions.structuralCompleteness < threshold.structural) return false;
  if (threshold.publicationFit && dimensions.publicationFit < threshold.publicationFit) return false;

  return true;
}

/**
 * Evaluate a generated artifact against the 5-dimension rubric.
 */
export async function evaluateArtifact(
  run: { id: string },
  artifactId: string,
  bible: BibleContent,
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<EvaluationResult> {
  const artifact = await prisma.generatedArtifact.findUniqueOrThrow({
    where: { id: artifactId },
  });

  const category = getArtifactCategory(artifact.artifactType);
  const weights = EVALUATION_WEIGHTS[category] ?? EVALUATION_WEIGHTS.written;
  const threshold = ACCEPTANCE_THRESHOLDS[category] ?? ACCEPTANCE_THRESHOLDS.written;

  // Get the artifact content for evaluation
  const content = artifact.markdownContent ?? artifact.jsonContent;

  const system = buildEvaluateArtifactSystemPrompt();
  const prompt = buildEvaluateArtifactUserPrompt(
    artifact.artifactType,
    artifact.title,
    content,
    bible,
  );

  const { text, usage } = await generateText({
    model, system, prompt, maxOutputTokens,
  });

  const parsed = parseJsonResponse(text);
  const evalResponse = EvaluationResponseSchema.parse(parsed);

  const overallScore = calculateOverallScore(evalResponse, weights);
  const passed = checkAcceptance(
    {
      structuralCompleteness: evalResponse.structuralCompleteness,
      continuityScore: evalResponse.continuityScore,
      publicationFit: evalResponse.publicationFit,
    },
    overallScore,
    threshold,
    evalResponse.findings as EvaluationFinding[],
  );

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);

  const evaluation = await prisma.artifactEvaluation.create({
    data: {
      artifactId: artifact.id,
      artifactVersion: artifact.version,
      evaluationType: category,
      overallScore,
      structuralCompleteness: evalResponse.structuralCompleteness,
      continuityScore: evalResponse.continuityScore,
      dndSanity: evalResponse.dndSanity,
      editorialQuality: evalResponse.editorialQuality,
      publicationFit: evalResponse.publicationFit,
      passed,
      findings: evalResponse.findings as any,
      recommendedActions: evalResponse.recommendedActions as any,
      tokenCount: totalTokens,
    },
  });

  // Update artifact status based on evaluation
  await prisma.generatedArtifact.update({
    where: { id: artifact.id },
    data: { status: passed ? 'accepted' : 'failed_evaluation' },
  });

  // Update run token count
  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  // Publish evaluation event
  await publishGenerationEvent(run.id, {
    type: 'artifact_evaluated',
    runId: run.id,
    artifactId: artifact.id,
    overallScore,
    passed,
  });

  return {
    evaluationId: evaluation.id,
    overallScore,
    passed,
    findings: evalResponse.findings as EvaluationFinding[],
    recommendedActions: evalResponse.recommendedActions,
  };
}
