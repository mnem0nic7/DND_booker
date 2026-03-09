import type { EvaluationFinding } from '@dnd-booker/shared';

export function mergeEvaluationFindings(
  modelFindings: EvaluationFinding[],
  deterministicFindings: EvaluationFinding[],
): EvaluationFinding[] {
  const merged: EvaluationFinding[] = [];
  const seen = new Set<string>();

  for (const finding of [...deterministicFindings, ...modelFindings]) {
    const key = `${finding.code}:${finding.affectedScope}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(finding);
  }

  return merged;
}

export function applyDeterministicPublicationPenalty(
  publicationFit: number,
  deterministicFindings: EvaluationFinding[],
): number {
  let penalty = 0;

  for (const finding of deterministicFindings) {
    if (finding.severity === 'critical') penalty += 25;
    else if (finding.severity === 'major') penalty += 12;
    else if (finding.severity === 'minor') penalty += 6;
  }

  return Math.max(0, publicationFit - Math.min(40, penalty));
}
