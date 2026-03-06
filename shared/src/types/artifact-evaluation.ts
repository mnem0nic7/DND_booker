export type FindingSeverity = 'critical' | 'major' | 'minor' | 'informational';

export interface EvaluationFinding {
  severity: FindingSeverity;
  code: string;
  message: string;
  affectedScope: string;
  suggestedFix?: string;
}

export interface ArtifactEvaluation {
  id: string;
  artifactId: string;
  artifactVersion: number;
  evaluationType: string;
  overallScore: number;
  structuralCompleteness: number | null;
  continuityScore: number | null;
  dndSanity: number | null;
  editorialQuality: number | null;
  publicationFit: number | null;
  passed: boolean;
  findings: EvaluationFinding[];
  recommendedActions: string[] | null;
  evaluatorModel: string | null;
  tokenCount: number | null;
  createdAt: string;
}

export interface EvaluationWeights {
  structuralCompleteness: number;
  continuity: number;
  dndSanity: number;
  editorialQuality: number;
  publicationFit: number;
}

export const EVALUATION_WEIGHTS: Record<string, EvaluationWeights> = {
  planning: { structuralCompleteness: 0.30, continuity: 0.30, dndSanity: 0.10, editorialQuality: 0.15, publicationFit: 0.15 },
  reference: { structuralCompleteness: 0.25, continuity: 0.30, dndSanity: 0.20, editorialQuality: 0.10, publicationFit: 0.15 },
  written: { structuralCompleteness: 0.20, continuity: 0.25, dndSanity: 0.20, editorialQuality: 0.20, publicationFit: 0.15 },
};

export interface AcceptanceThreshold {
  overall: number;
  continuity?: number;
  structural?: number;
  publicationFit?: number;
}

export const ACCEPTANCE_THRESHOLDS: Record<string, AcceptanceThreshold> = {
  planning: { overall: 85, continuity: 90, structural: 90 },
  reference: { overall: 80, continuity: 85, structural: 80 },
  written: { overall: 78, continuity: 80, structural: 80, publicationFit: 75 },
  assembly: { overall: 90, structural: 95, publicationFit: 90 },
};
