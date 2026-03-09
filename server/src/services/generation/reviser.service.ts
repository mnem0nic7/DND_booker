import { generateText, type LanguageModel } from 'ai';
import type { BibleContent, EvaluationFinding } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import { markdownToTipTap } from '../ai-wizard.service.js';
import { analyzeEstimatedArtifactLayout } from './layout-estimate.service.js';
import {
  buildReviseArtifactSystemPrompt,
  buildReviseArtifactUserPrompt,
} from './prompts/revise-artifact.prompt.js';

const MAX_REVISIONS = 2;

export interface RevisionResult {
  newArtifactId: string;
  newVersion: number;
  revisionId: string;
}

/**
 * Check how many revisions an artifact has already undergone.
 */
export async function getRevisionCount(artifactId: string): Promise<number> {
  // Count revisions by looking at all versions of this artifact (same runId + type + key)
  const artifact = await prisma.generatedArtifact.findUniqueOrThrow({
    where: { id: artifactId },
  });

  const count = await prisma.artifactRevision.count({
    where: {
      artifact: {
        runId: artifact.runId,
        artifactType: artifact.artifactType,
        artifactKey: artifact.artifactKey,
      },
    },
  });

  return count;
}

/**
 * Revise a failed artifact based on evaluation findings.
 * Creates a new version of the artifact and an ArtifactRevision record.
 * Returns null if max revisions exceeded.
 */
export async function reviseArtifact(
  run: { id: string },
  artifactId: string,
  findings: EvaluationFinding[],
  bible: BibleContent,
  model: LanguageModel,
  maxOutputTokens: number,
): Promise<RevisionResult | null> {
  const artifact = await prisma.generatedArtifact.findUniqueOrThrow({
    where: { id: artifactId },
  });

  // Check revision count
  const revisionCount = await getRevisionCount(artifactId);
  if (revisionCount >= MAX_REVISIONS) {
    // Escalate — mark as needs_review for user intervention
    await prisma.generatedArtifact.update({
      where: { id: artifactId },
      data: { status: 'needs_review' },
    });

    await publishGenerationEvent(run.id, {
      type: 'artifact_escalated',
      runId: run.id,
      artifactId: artifact.id,
      artifactType: artifact.artifactType,
      title: artifact.title,
      reason: `Max revisions (${MAX_REVISIONS}) exceeded`,
    });

    return null;
  }

  // Get the content to revise
  const content = artifact.markdownContent ?? artifact.jsonContent;
  const isMarkdown = artifact.markdownContent !== null;
  const layoutAnalysis = analyzeEstimatedArtifactLayout(
    (artifact.tiptapContent as unknown) ?? artifact.jsonContent,
  );

  const system = buildReviseArtifactSystemPrompt();
  const prompt = buildReviseArtifactUserPrompt(
    artifact.artifactType,
    artifact.title,
    content,
    findings,
    bible,
    layoutAnalysis?.summary ?? null,
  );

  const { text, usage } = await generateText({
    model, system, prompt, maxOutputTokens,
  });

  const totalTokens = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  const newVersion = artifact.version + 1;

  // Create the new artifact version
  const newArtifact = await prisma.generatedArtifact.create({
    data: {
      runId: artifact.runId,
      projectId: artifact.projectId,
      artifactType: artifact.artifactType,
      artifactKey: artifact.artifactKey,
      parentArtifactId: artifact.id,
      status: 'generated',
      version: newVersion,
      title: artifact.title,
      summary: artifact.summary,
      markdownContent: isMarkdown ? text : null,
      tiptapContent: isMarkdown ? markdownToTipTap(text) as any : null,
      jsonContent: isMarkdown ? artifact.jsonContent : parseJsonResponse(text) as any,
      tokenCount: totalTokens,
      pageEstimate: artifact.pageEstimate,
    },
  });

  // Create revision record for traceability
  const revision = await prisma.artifactRevision.create({
    data: {
      artifactId: newArtifact.id,
      fromVersion: artifact.version,
      toVersion: newVersion,
      reason: findings.filter((f) => f.severity === 'critical' || f.severity === 'major')
        .map((f) => f.message).join('; '),
      findingCodes: findings.map((f) => f.code) as any,
      revisionPrompt: prompt,
      tokenCount: totalTokens,
    },
  });

  // Update run token count
  await prisma.generationRun.update({
    where: { id: run.id },
    data: { actualTokens: { increment: totalTokens } },
  });

  // Publish revision event
  await publishGenerationEvent(run.id, {
    type: 'artifact_revised',
    runId: run.id,
    artifactId: newArtifact.id,
    artifactType: artifact.artifactType,
    title: artifact.title,
    version: newVersion,
  });

  return {
    newArtifactId: newArtifact.id,
    newVersion,
    revisionId: revision.id,
  };
}
