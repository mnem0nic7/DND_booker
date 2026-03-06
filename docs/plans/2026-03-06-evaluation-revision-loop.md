# Phase 8: Evaluation + Revision Loop Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Multi-dimensional scoring of generated artifacts with bounded revision. The evaluator scores artifacts on 5 dimensions (structural completeness, continuity, D&D sanity, editorial quality, publication fit) using per-category weights and thresholds. Failed artifacts get revision attempts (capped at 2). The shared types (`EVALUATION_WEIGHTS`, `ACCEPTANCE_THRESHOLDS`, `EvaluationFinding`) already exist in `@dnd-booker/shared`.

**Architecture:** The evaluator calls AI to score an artifact, validates the response, calculates the weighted overall score, and creates an `ArtifactEvaluation` record. The reviser takes failed evaluations' findings, calls AI to produce a revised version, creates a new artifact version and an `ArtifactRevision` record for traceability.

**Tech Stack:** Vercel AI SDK (`generateText`), Zod, Prisma 6, Redis pub/sub

---

### Task 1: Evaluate Artifact Prompt Builder

**Files:**
- Create: `server/src/services/generation/prompts/evaluate-artifact.prompt.ts`

**Step 1: Create the evaluate artifact prompt builder**

```typescript
// server/src/services/generation/prompts/evaluate-artifact.prompt.ts
import type { BibleContent } from '@dnd-booker/shared';

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
- Include at least one informational finding with positive feedback`;
}

export function buildEvaluateArtifactUserPrompt(
  artifactType: string,
  artifactTitle: string,
  artifactContent: unknown,
  bible: BibleContent,
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

  return parts.join('\n');
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/prompts/evaluate-artifact.prompt.ts
git commit -m "feat: add evaluate artifact prompt builder"
```

---

### Task 2: Revise Artifact Prompt Builder

**Files:**
- Create: `server/src/services/generation/prompts/revise-artifact.prompt.ts`

**Step 1: Create the revise artifact prompt builder**

```typescript
// server/src/services/generation/prompts/revise-artifact.prompt.ts
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

  return parts.join('\n');
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/prompts/revise-artifact.prompt.ts
git commit -m "feat: add revise artifact prompt builder"
```

---

### Task 3: Evaluator Service

**Files:**
- Create: `server/src/services/generation/evaluator.service.ts`

**Step 1: Create the evaluator service**

The evaluator:
1. Determines the artifact category (planning/reference/written) from the artifact type
2. Calls AI to score the artifact on 5 dimensions and generate findings
3. Calculates the weighted overall score using `EVALUATION_WEIGHTS`
4. Determines pass/fail using `ACCEPTANCE_THRESHOLDS`
5. Creates an `ArtifactEvaluation` record
6. Publishes a progress event

```typescript
// server/src/services/generation/evaluator.service.ts
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
    data: { status: passed ? 'accepted' : 'needs_revision' },
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
    findingCount: evalResponse.findings.length,
  });

  return {
    evaluationId: evaluation.id,
    overallScore,
    passed,
    findings: evalResponse.findings as EvaluationFinding[],
    recommendedActions: evalResponse.recommendedActions,
  };
}
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/evaluator.service.ts
git commit -m "feat: add evaluator service for multi-dimensional artifact scoring"
```

---

### Task 4: Reviser Service

**Files:**
- Create: `server/src/services/generation/reviser.service.ts`

**Step 1: Create the reviser service**

```typescript
// server/src/services/generation/reviser.service.ts
import { generateText, type LanguageModel } from 'ai';
import type { BibleContent, EvaluationFinding } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { publishGenerationEvent } from './pubsub.service.js';
import { parseJsonResponse } from './parse-json.js';
import { markdownToTipTap } from '../ai-wizard.service.js';
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

  const system = buildReviseArtifactSystemPrompt();
  const prompt = buildReviseArtifactUserPrompt(
    artifact.artifactType,
    artifact.title,
    content,
    findings,
    bible,
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
```

**Step 2: Verify types compile**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/services/generation/reviser.service.ts
git commit -m "feat: add reviser service for bounded artifact revision"
```

---

### Task 5: Evaluator Tests

**Files:**
- Create: `server/src/__tests__/generation/evaluator.test.ts`

**Step 1: Write the evaluator tests**

Test both the pure functions (calculateOverallScore, checkAcceptance, getArtifactCategory) and the evaluateArtifact integration.

```typescript
// server/src/__tests__/generation/evaluator.test.ts
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, EvaluationFinding } from '@dnd-booker/shared';
import { EVALUATION_WEIGHTS, ACCEPTANCE_THRESHOLDS } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import {
  evaluateArtifact,
  calculateOverallScore,
  checkAcceptance,
  getArtifactCategory,
} from '../../services/generation/evaluator.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'Test Campaign',
  summary: 'A test.',
  premise: 'Testing.',
  worldRules: {
    setting: 'Test world',
    era: 'Modern',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous'],
    forbiddenElements: [],
    worldSpecificRules: [],
  },
  actStructure: [],
  timeline: [],
  levelProgression: null,
  pageBudget: [],
  styleGuide: {
    voice: 'Test',
    vocabulary: [],
    avoidTerms: [],
    narrativePerspective: 'second person',
    toneNotes: '',
  },
  openThreads: [],
  entities: [],
};

const PASSING_EVAL_RESPONSE = {
  structuralCompleteness: 92,
  continuityScore: 88,
  dndSanity: 85,
  editorialQuality: 80,
  publicationFit: 82,
  findings: [
    { severity: 'informational', code: 'GOOD_PACING', message: 'Well-paced narrative.', affectedScope: 'global' },
  ],
  recommendedActions: ['Minor polish on transitions'],
};

const FAILING_EVAL_RESPONSE = {
  structuralCompleteness: 65,
  continuityScore: 70,
  dndSanity: 60,
  editorialQuality: 55,
  publicationFit: 50,
  findings: [
    { severity: 'critical', code: 'MISSING_SECTION', message: 'Section 2 is missing.', affectedScope: 'section-2', suggestedFix: 'Add the missing section.' },
    { severity: 'major', code: 'NPC_INCONSISTENCY', message: 'NPC name differs from canon.', affectedScope: 'chief-gnarltooth' },
  ],
  recommendedActions: ['Add missing section', 'Fix NPC names'],
};

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `eval-test-${Date.now()}@test.com`,
      displayName: `Eval Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Eval Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Evaluator — pure functions', () => {
  it('getArtifactCategory maps artifact types to categories', () => {
    expect(getArtifactCategory('chapter_plan')).toBe('planning');
    expect(getArtifactCategory('npc_dossier')).toBe('reference');
    expect(getArtifactCategory('chapter_draft')).toBe('written');
    expect(getArtifactCategory('unknown_type')).toBe('written');
  });

  it('calculateOverallScore computes weighted score', () => {
    const dimensions = {
      structuralCompleteness: 90,
      continuityScore: 85,
      dndSanity: 80,
      editorialQuality: 75,
      publicationFit: 70,
    };
    const score = calculateOverallScore(dimensions, EVALUATION_WEIGHTS.written);
    // 90*0.20 + 85*0.25 + 80*0.20 + 75*0.20 + 70*0.15 = 18+21.25+16+15+10.5 = 80.75 → 81
    expect(score).toBe(81);
  });

  it('checkAcceptance passes when all thresholds met', () => {
    const result = checkAcceptance(
      { structuralCompleteness: 92, continuityScore: 88, publicationFit: 82 },
      85,
      ACCEPTANCE_THRESHOLDS.written,
      [],
    );
    expect(result).toBe(true);
  });

  it('checkAcceptance fails on critical finding', () => {
    const findings: EvaluationFinding[] = [
      { severity: 'critical', code: 'TEST', message: 'Critical issue', affectedScope: 'global' },
    ];
    const result = checkAcceptance(
      { structuralCompleteness: 95, continuityScore: 95, publicationFit: 95 },
      95,
      ACCEPTANCE_THRESHOLDS.written,
      findings,
    );
    expect(result).toBe(false);
  });

  it('checkAcceptance fails when overall score below threshold', () => {
    const result = checkAcceptance(
      { structuralCompleteness: 90, continuityScore: 90, publicationFit: 90 },
      70,
      ACCEPTANCE_THRESHOLDS.written,
      [],
    );
    expect(result).toBe(false);
  });
});

describe('Evaluator — evaluateArtifact', () => {
  it('should create a passing ArtifactEvaluation', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(PASSING_EVAL_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'test-chapter',
        status: 'generated',
        version: 1,
        title: 'Test Chapter',
        jsonContent: { test: true } as any,
      },
    });

    const result = await evaluateArtifact(run!, artifact.id, SAMPLE_BIBLE, {} as any, 4096);

    expect(result.passed).toBe(true);
    expect(result.overallScore).toBeGreaterThan(0);
    expect(result.findings.length).toBe(1);

    const evaluation = await prisma.artifactEvaluation.findUnique({ where: { id: result.evaluationId } });
    expect(evaluation).not.toBeNull();
    expect(evaluation!.passed).toBe(true);

    // Artifact should be accepted
    const updated = await prisma.generatedArtifact.findUnique({ where: { id: artifact.id } });
    expect(updated!.status).toBe('accepted');
  });

  it('should create a failing ArtifactEvaluation with critical findings', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(FAILING_EVAL_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'test-failing',
        status: 'generated',
        version: 1,
        title: 'Failing Chapter',
        jsonContent: { test: true } as any,
      },
    });

    const result = await evaluateArtifact(run!, artifact.id, SAMPLE_BIBLE, {} as any, 4096);

    expect(result.passed).toBe(false);
    expect(result.findings.length).toBe(2);

    // Artifact should be needs_revision
    const updated = await prisma.generatedArtifact.findUnique({ where: { id: artifact.id } });
    expect(updated!.status).toBe('needs_revision');
  });

  it('should update run token count', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify(PASSING_EVAL_RESPONSE),
      usage: { inputTokens: 1000, outputTokens: 500 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'npc_dossier',
        artifactKey: 'test-npc-eval',
        status: 'generated',
        version: 1,
        title: 'Test NPC',
        jsonContent: { test: true } as any,
      },
    });

    await evaluateArtifact(run!, artifact.id, SAMPLE_BIBLE, {} as any, 4096);

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(1500);
  });
});
```

**Step 2: Run tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/evaluator.test.ts`
Expected: All 8 tests PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/generation/evaluator.test.ts
git commit -m "test: add evaluator service tests"
```

---

### Task 6: Reviser Tests

**Files:**
- Create: `server/src/__tests__/generation/reviser.test.ts`

**Step 1: Write the reviser tests**

```typescript
// server/src/__tests__/generation/reviser.test.ts
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { generateText } from 'ai';
import type { BibleContent, EvaluationFinding } from '@dnd-booker/shared';
import { prisma } from '../../config/database.js';
import { reviseArtifact, getRevisionCount } from '../../services/generation/reviser.service.js';
import { createRun } from '../../services/generation/run.service.js';

vi.mock('ai', () => ({ generateText: vi.fn() }));
vi.mock('../../services/generation/pubsub.service.js', () => ({
  publishGenerationEvent: vi.fn(),
}));
const mockGenerateText = vi.mocked(generateText);

let testUser: { id: string };
let testProject: { id: string };

const SAMPLE_BIBLE: BibleContent = {
  title: 'Test Campaign',
  summary: 'A test.',
  premise: 'Testing.',
  worldRules: {
    setting: 'Test world',
    era: 'Modern',
    magicLevel: 'standard',
    technologyLevel: 'medieval',
    toneDescriptors: ['adventurous'],
    forbiddenElements: [],
    worldSpecificRules: [],
  },
  actStructure: [],
  timeline: [],
  levelProgression: null,
  pageBudget: [],
  styleGuide: {
    voice: 'Test',
    vocabulary: [],
    avoidTerms: [],
    narrativePerspective: 'second person',
    toneNotes: '',
  },
  openThreads: [],
  entities: [],
};

const SAMPLE_FINDINGS: EvaluationFinding[] = [
  { severity: 'critical', code: 'MISSING_SECTION', message: 'Section 2 is missing.', affectedScope: 'section-2', suggestedFix: 'Add the missing section.' },
  { severity: 'major', code: 'NPC_INCONSISTENCY', message: 'NPC name wrong.', affectedScope: 'npc-1' },
];

beforeAll(async () => {
  testUser = await prisma.user.create({
    data: {
      email: `reviser-test-${Date.now()}@test.com`,
      displayName: `Reviser Test ${Date.now()}`,
      passwordHash: 'test-hash',
    },
  });
  testProject = await prisma.project.create({
    data: { title: 'Reviser Test Project', userId: testUser.id },
  });
});

afterAll(async () => {
  await prisma.project.deleteMany({ where: { userId: testUser.id } });
  await prisma.user.delete({ where: { id: testUser.id } });
  await prisma.$disconnect();
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Reviser Service', () => {
  it('should create a new artifact version with revision record', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ fixed: true, content: 'revised' }),
      usage: { inputTokens: 1500, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'revise-test-ch',
        status: 'needs_revision',
        version: 1,
        title: 'Test Chapter',
        jsonContent: { original: true } as any,
      },
    });

    const result = await reviseArtifact(run!, artifact.id, SAMPLE_FINDINGS, SAMPLE_BIBLE, {} as any, 8192);

    expect(result).not.toBeNull();
    expect(result!.newVersion).toBe(2);

    // New artifact should exist
    const newArtifact = await prisma.generatedArtifact.findUnique({ where: { id: result!.newArtifactId } });
    expect(newArtifact).not.toBeNull();
    expect(newArtifact!.version).toBe(2);
    expect(newArtifact!.parentArtifactId).toBe(artifact.id);
    expect(newArtifact!.status).toBe('generated');

    // Revision record should exist
    const revision = await prisma.artifactRevision.findUnique({ where: { id: result!.revisionId } });
    expect(revision).not.toBeNull();
    expect(revision!.fromVersion).toBe(1);
    expect(revision!.toVersion).toBe(2);
  });

  it('should return null and escalate when max revisions exceeded', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    // Create original artifact
    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'max-revise-test',
        status: 'needs_revision',
        version: 1,
        title: 'Max Revise Test',
        jsonContent: {} as any,
      },
    });

    // Create 2 existing revision records to simulate max revisions
    const v2 = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'max-revise-test',
        status: 'needs_revision',
        version: 2,
        title: 'Max Revise Test',
        jsonContent: {} as any,
      },
    });
    await prisma.artifactRevision.create({
      data: { artifactId: v2.id, fromVersion: 1, toVersion: 2, reason: 'fix 1' },
    });

    const v3 = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'max-revise-test',
        status: 'needs_revision',
        version: 3,
        title: 'Max Revise Test',
        jsonContent: {} as any,
      },
    });
    await prisma.artifactRevision.create({
      data: { artifactId: v3.id, fromVersion: 2, toVersion: 3, reason: 'fix 2' },
    });

    const result = await reviseArtifact(run!, artifact.id, SAMPLE_FINDINGS, SAMPLE_BIBLE, {} as any, 8192);

    expect(result).toBeNull();

    // Artifact should be escalated to needs_review
    const updated = await prisma.generatedArtifact.findUnique({ where: { id: artifact.id } });
    expect(updated!.status).toBe('needs_review');
  });

  it('should update run token count on revision', async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({ revised: true }),
      usage: { inputTokens: 1500, outputTokens: 2000 },
    } as any);

    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'npc_dossier',
        artifactKey: 'token-revise-test',
        status: 'needs_revision',
        version: 1,
        title: 'Token Test',
        jsonContent: {} as any,
      },
    });

    await reviseArtifact(run!, artifact.id, SAMPLE_FINDINGS, SAMPLE_BIBLE, {} as any, 8192);

    const updatedRun = await prisma.generationRun.findUnique({ where: { id: run!.id } });
    expect(updatedRun!.actualTokens).toBe(3500);
  });

  it('getRevisionCount returns correct count', async () => {
    const run = await createRun({
      projectId: testProject.id,
      userId: testUser.id,
      prompt: 'test',
    });

    const artifact = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'count-test',
        status: 'generated',
        version: 1,
        title: 'Count Test',
        jsonContent: {} as any,
      },
    });

    expect(await getRevisionCount(artifact.id)).toBe(0);

    // Add a revision
    const v2 = await prisma.generatedArtifact.create({
      data: {
        runId: run!.id,
        projectId: run!.projectId,
        artifactType: 'chapter_draft',
        artifactKey: 'count-test',
        status: 'generated',
        version: 2,
        title: 'Count Test',
        jsonContent: {} as any,
      },
    });
    await prisma.artifactRevision.create({
      data: { artifactId: v2.id, fromVersion: 1, toVersion: 2, reason: 'fix' },
    });

    expect(await getRevisionCount(artifact.id)).toBe(1);
  });
});
```

**Step 2: Run tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/reviser.test.ts`
Expected: All 4 tests PASS

**Step 3: Commit**

```bash
cd /home/gallison/workspace/DND_booker
git add server/src/__tests__/generation/reviser.test.ts
git commit -m "test: add reviser service tests"
```

---

### Task 7: Type-check + Integration Verification

**Files:**
- No new files

**Step 1: Run full server type check**

Run: `cd /home/gallison/workspace/DND_booker/server && npx tsc --noEmit`
Expected: PASS

**Step 2: Run all generation tests**

Run: `cd /home/gallison/workspace/DND_booker/server && npx vitest run src/__tests__/generation/`
Expected: All tests PASS (previous 74 + new 12 = 86 passing)

**Step 3: Commit if any fixes were needed**
