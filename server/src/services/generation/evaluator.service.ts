import type { LanguageModel } from 'ai';
import { z } from 'zod';
import type { BibleContent, EvaluationFinding, EvaluationWeights, AcceptanceThreshold } from '@dnd-booker/shared';
import {
  ACCEPTANCE_THRESHOLDS,
  EVALUATION_WEIGHTS,
  assessStatBlockAttrs,
  hasEncounterTableContent,
  normalizeEncounterTableAttrs,
  normalizeStructuredText,
} from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { analyzeEstimatedArtifactLayout } from './layout-estimate.service.js';
import {
  applyDeterministicPublicationPenalty,
  mergeEvaluationFindings,
} from './evaluator-layout-helpers.js';
import {
  buildEvaluateArtifactSystemPrompt,
  buildEvaluateArtifactUserPrompt,
} from './prompts/evaluate-artifact.prompt.js';
import { generateObjectWithTimeout } from './model-timeouts.js';

const FindingSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor', 'informational']),
  code: z.string(),
  message: z.string(),
  affectedScope: z.string(),
  suggestedFix: z.string().nullish().transform((value) => value ?? undefined),
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
  art_direction_plan: 'reference',
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

interface TipTapLikeNode {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: TipTapLikeNode[];
}

function mergeRecommendedActions(
  recommendedActions: string[],
  findings: EvaluationFinding[],
): string[] {
  const merged = [...recommendedActions];

  for (const finding of findings) {
    if (finding.suggestedFix && !merged.includes(finding.suggestedFix)) {
      merged.push(finding.suggestedFix);
    }
  }

  return merged;
}

function readStructuredAttr(value: unknown): string {
  return normalizeStructuredText(value).trim();
}

function isCompleteEncounterTableForAcceptance(attrs: Record<string, unknown>): boolean {
  if (!hasEncounterTableContent(attrs)) return false;

  const normalized = normalizeEncounterTableAttrs(attrs);
  const requiredKeys = ['setup', 'opposition', 'terrain', 'tactics'] as const;
  const optionalKeys = ['rewards', 'payoff', 'aftermath', 'objective', 'description', 'notes'] as const;
  const requiredCount = requiredKeys.filter((key) => readStructuredAttr(normalized[key]).length > 0).length;
  const optionalCount = optionalKeys.filter((key) => readStructuredAttr(normalized[key]).length > 0).length;

  return requiredCount >= 3 && optionalCount >= 2;
}

function collectDeterministicContentFindings(content: unknown): EvaluationFinding[] {
  if (!content || typeof content !== 'object') return [];

  const findings: EvaluationFinding[] = [];
  let statBlockCount = 0;
  let encounterTableCount = 0;
  let completeEncounterTableCount = 0;
  let supportBlockCount = 0;

  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }

    const tiptapNode = node as TipTapLikeNode;
    const nodeType = typeof tiptapNode.type === 'string' ? tiptapNode.type : '';

    if (nodeType === 'statBlock') {
      statBlockCount += 1;
      const assessment = assessStatBlockAttrs(tiptapNode.attrs ?? {});
      if (assessment.isPlaceholder || assessment.isIncomplete || assessment.isSuspicious) {
        findings.push({
          severity: 'critical',
          code: 'PLACEHOLDER_STAT_BLOCK',
          message: `The stat block "${String((tiptapNode.attrs ?? {}).name ?? 'Unknown Creature')}" is incomplete or placeholder-grade.`,
          affectedScope: String((tiptapNode.attrs ?? {}).name ?? 'statBlock'),
          suggestedFix: 'Rewrite the stat block with canonical lowercase keys, a challenge rating, and real traits/actions.',
        });
      }
    } else if (nodeType === 'encounterTable') {
      encounterTableCount += 1;
      if (isCompleteEncounterTableForAcceptance(tiptapNode.attrs ?? {})) {
        completeEncounterTableCount += 1;
      }
    } else if (
      nodeType === 'readAloudBox'
      || nodeType === 'sidebarCallout'
      || nodeType === 'bulletList'
      || nodeType === 'orderedList'
      || nodeType === 'handout'
      || nodeType === 'npcProfile'
      || nodeType === 'randomTable'
    ) {
      supportBlockCount += 1;
    }

    if (Array.isArray(tiptapNode.content)) {
      for (const child of tiptapNode.content) visit(child);
    }
  };

  visit(content);

  const hasEncounterMarkers = statBlockCount > 0 || encounterTableCount > 0;
  if (
    hasEncounterMarkers
    && (
      statBlockCount === 0
      || encounterTableCount === 0
      || completeEncounterTableCount === 0
      || supportBlockCount < 2
    )
  ) {
    findings.push({
      severity: 'critical',
      code: 'INCOMPLETE_ENCOUNTER_PACKET',
      message: 'Encounter content is present without a full runnable packet and adequate support blocks.',
      affectedScope: 'chapter',
      suggestedFix: 'Rewrite the encounter as a full packet with setup, opposition, terrain, tactics, rewards, aftermath, and any needed stat blocks.',
    });
  }

  return findings;
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
  const layoutAnalysis = analyzeEstimatedArtifactLayout(
    (artifact.tiptapContent as unknown) ?? artifact.jsonContent,
  );
  const deterministicLayoutFindings = layoutAnalysis?.findings ?? [];
  const deterministicContentFindings = collectDeterministicContentFindings(
    (artifact.tiptapContent as unknown) ?? artifact.jsonContent,
  );

  const system = buildEvaluateArtifactSystemPrompt();
  const prompt = buildEvaluateArtifactUserPrompt(
    artifact.artifactType,
    artifact.title,
    content,
    bible,
    layoutAnalysis?.summary ?? null,
    deterministicLayoutFindings,
  );

  const { object, usage } = await generateObjectWithTimeout(`Artifact evaluation for ${artifact.title}`, {
    model,
    schema: EvaluationResponseSchema,
    system,
    prompt,
    maxOutputTokens,
  });
  const evalResponse = EvaluationResponseSchema.parse(object);
  const mergedFindings = mergeEvaluationFindings(
    evalResponse.findings as EvaluationFinding[],
    [...deterministicLayoutFindings, ...deterministicContentFindings],
  );
  const adjustedPublicationFit = applyDeterministicPublicationPenalty(
    evalResponse.publicationFit,
    deterministicLayoutFindings,
  );
  const mergedRecommendedActions = mergeRecommendedActions(
    evalResponse.recommendedActions,
    [...deterministicLayoutFindings, ...deterministicContentFindings],
  );

  const overallScore = calculateOverallScore({
    ...evalResponse,
    publicationFit: adjustedPublicationFit,
  }, weights);
  const passed = checkAcceptance(
    {
      structuralCompleteness: evalResponse.structuralCompleteness,
      continuityScore: evalResponse.continuityScore,
      publicationFit: adjustedPublicationFit,
    },
    overallScore,
    threshold,
    mergedFindings,
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
      publicationFit: adjustedPublicationFit,
      passed,
      findings: mergedFindings as any,
      recommendedActions: mergedRecommendedActions as any,
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
    artifactType: artifact.artifactType,
    overallScore,
    passed,
    findingCount: mergedFindings.length,
  });

  return {
    evaluationId: evaluation.id,
    overallScore,
    passed,
    findings: mergedFindings,
    recommendedActions: mergedRecommendedActions,
  };
}
