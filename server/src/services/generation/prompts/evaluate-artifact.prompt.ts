import type { BibleContent, EvaluationFinding } from '@dnd-booker/shared';

export function buildEvaluateArtifactSystemPrompt(): string {
  return `You are a D&D content editor and quality reviewer. You evaluate generated artifacts against a 5-dimension rubric. Your evaluation must be thorough, fair, and actionable.

You MUST respond with ONLY a JSON object (no markdown fences, no commentary). The JSON must match this exact schema:

{
  "structuralCompleteness": 85,
  "continuityScore": 90,
  "dndSanity": 80,
  "editorialQuality": 75,
  "publicationFit": 82,
  "findings": [
    {
      "severity": "critical | major | minor | informational",
      "code": "SHORT_CODE",
      "message": "Clear description of the issue",
      "affectedScope": "section-slug or entity-slug or 'global'",
      "suggestedFix": "How to fix this issue"
    }
  ],
  "recommendedActions": ["High-level action to improve the artifact"]
}

Scoring dimensions (each 0-100):
- structuralCompleteness: All required components present, correct structure, nothing missing
- continuityScore: Aligns with the campaign bible, references correct entity data, no contradictions
- dndSanity: Mechanically plausible for 5e, balanced encounters, legal stat blocks, correct rules
- editorialQuality: Readable, well-paced, useful to a DM, good prose quality
- publicationFit: Correct size for target, export-ready structure, proper formatting

Finding severity:
- critical: Blocks assembly, mandatory fix (e.g., canon contradiction breaking plot)
- major: Should be fixed (e.g., location inconsistency, CR mismatch)
- minor: Nice to fix (e.g., repetitive phrasing, weak transitions)
- informational: Optimization suggestion, no action needed

Rules:
- Score honestly — do not inflate scores
- Every score below 80 must have at least one finding explaining why
- Critical findings must have a suggestedFix
- Finding codes should be uppercase snake_case (e.g., MISSING_SECTION, NPC_INCONSISTENCY)
- Include at least one informational finding with positive feedback
- When deterministic layout findings are provided in the user prompt, treat them as factual signals and reflect them in publicationFit and findings rather than ignoring them`;
}

export function buildEvaluateArtifactUserPrompt(
  artifactType: string,
  artifactTitle: string,
  artifactContent: unknown,
  bible: BibleContent,
  estimatedLayoutSummary?: string | null,
  deterministicLayoutFindings?: EvaluationFinding[],
): string {
  const parts: string[] = [
    `Artifact to evaluate: "${artifactTitle}" (type: ${artifactType})`,
    '',
    '## Artifact Content',
  ];

  if (typeof artifactContent === 'string') {
    parts.push(artifactContent);
  } else {
    parts.push(JSON.stringify(artifactContent, null, 2));
  }

  parts.push(
    '',
    '## Campaign Bible Context (for continuity checking)',
    `Title: ${bible.title}`,
    `Premise: ${bible.premise}`,
    `Setting: ${bible.worldRules.setting}`,
    `Era: ${bible.worldRules.era}`,
    `Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
    `Magic level: ${bible.worldRules.magicLevel}`,
    `Voice: ${bible.styleGuide.voice}`,
    `Perspective: ${bible.styleGuide.narrativePerspective}`,
  );

  if (bible.entities.length > 0) {
    parts.push('', 'Canonical entities:');
    for (const e of bible.entities) {
      parts.push(`  - ${e.name} (${e.entityType}, ${e.slug}): ${e.summary}`);
    }
  }

  if (estimatedLayoutSummary) {
    parts.push(
      '',
      '## Deterministic Estimated Layout Context',
      'This estimate was computed from the structured document before evaluation.',
      estimatedLayoutSummary,
    );
  }

  if (deterministicLayoutFindings && deterministicLayoutFindings.length > 0) {
    parts.push('', 'Deterministic layout findings:');
    for (const finding of deterministicLayoutFindings) {
      parts.push(`  - [${finding.severity}] ${finding.code} (${finding.affectedScope}): ${finding.message}`);
      if (finding.suggestedFix) {
        parts.push(`    Fix: ${finding.suggestedFix}`);
      }
    }
  }

  return parts.join('\n');
}
