import type { BibleContent, EvaluationFinding } from '@dnd-booker/shared';

export function buildReviseArtifactSystemPrompt(): string {
  return `You are a D&D content editor. You revise generated artifacts to fix specific issues identified during evaluation. You must address ALL critical and major findings while preserving the artifact's strengths.

Output rules:
- For JSON artifacts: respond with ONLY the corrected JSON object
- For markdown artifacts: respond with ONLY the corrected markdown
- Do NOT add commentary, explanations, or markdown fences
- Preserve all content that was not flagged as an issue
- Fix the specific problems identified in the findings
- Do not introduce new issues while fixing existing ones`;
}

export function buildReviseArtifactUserPrompt(
  artifactType: string,
  artifactTitle: string,
  artifactContent: unknown,
  findings: EvaluationFinding[],
  bible: BibleContent,
  estimatedLayoutSummary?: string | null,
): string {
  const parts: string[] = [
    `Artifact to revise: "${artifactTitle}" (type: ${artifactType})`,
    '',
    '## Findings to Address',
  ];

  const critical = findings.filter((f) => f.severity === 'critical');
  const major = findings.filter((f) => f.severity === 'major');

  if (critical.length > 0) {
    parts.push('### Critical (MUST fix):');
    for (const f of critical) {
      parts.push(`- [${f.code}] ${f.message}`);
      if (f.suggestedFix) parts.push(`  Fix: ${f.suggestedFix}`);
    }
  }

  if (major.length > 0) {
    parts.push('### Major (SHOULD fix):');
    for (const f of major) {
      parts.push(`- [${f.code}] ${f.message}`);
      if (f.suggestedFix) parts.push(`  Fix: ${f.suggestedFix}`);
    }
  }

  parts.push('', '## Current Artifact Content');
  if (typeof artifactContent === 'string') {
    parts.push(artifactContent);
  } else {
    parts.push(JSON.stringify(artifactContent, null, 2));
  }

  parts.push(
    '',
    '## Campaign Bible Context',
    `Title: ${bible.title}`,
    `Premise: ${bible.premise}`,
    `Setting: ${bible.worldRules.setting}`,
    `Tone: ${bible.worldRules.toneDescriptors.join(', ')}`,
  );

  if (estimatedLayoutSummary) {
    parts.push(
      '',
      '## Deterministic Estimated Layout Context',
      'Use this structural estimate while revising layout, formatting, and block placement issues.',
      estimatedLayoutSummary,
    );
  }

  return parts.join('\n');
}
