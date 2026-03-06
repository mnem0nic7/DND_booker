# Autonomous Generation Infrastructure — Phase 1–3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the data model, services, and API for generation runs, tasks, and DAG-based orchestration — the infrastructure foundation for autonomous campaign generation.

**Architecture:** Shared TypeScript types define the domain. Prisma models persist runs, tasks, artifacts, canon entities, evaluations, and per-chapter documents. Services handle CRUD and state machine logic. Express routes expose run lifecycle and SSE progress streaming. No AI calls yet — this is pure infrastructure.

**Tech Stack:** TypeScript, Prisma 6, PostgreSQL, Express 5, Zod, Vitest + Supertest, Redis (pub/sub for SSE)

**Master Plan Reference:** `docs/plans/2026-03-06-autonomous-generation-master-plan.md` — Phases 1, 2, and 3.

---

## Task 1: Create shared GenerationRun types

**Files:**
- Create: `shared/src/types/generation-run.ts`

**Step 1: Create the types file**

```typescript
// shared/src/types/generation-run.ts

export type RunStatus =
  | 'queued'
  | 'planning'
  | 'generating_assets'
  | 'generating_prose'
  | 'evaluating'
  | 'revising'
  | 'assembling'
  | 'completed'
  | 'failed'
  | 'paused'
  | 'cancelled';

export type GenerationMode = 'one_shot' | 'module' | 'campaign' | 'sourcebook';

export type GenerationQuality = 'quick' | 'polished';

export interface GenerationRunInput {
  prompt: string;
  mode?: GenerationMode;
  quality?: GenerationQuality;
  pageTarget?: number;
  constraints?: GenerationConstraints;
}

export interface GenerationConstraints {
  tone?: string;
  levelRange?: string;
  settingPreference?: string;
  includeHandouts?: boolean;
  includeMaps?: boolean;
  strict5e?: boolean;
}

export interface GenerationRun {
  id: string;
  projectId: string;
  userId: string;
  mode: GenerationMode;
  quality: GenerationQuality;
  status: RunStatus;
  currentStage: string | null;
  inputPrompt: string;
  inputParameters: GenerationConstraints | null;
  progressPercent: number;
  estimatedPages: number | null;
  estimatedTokens: number | null;
  estimatedCost: number | null;
  actualTokens: number;
  actualCost: number;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface GenerationRunSummary {
  id: string;
  mode: GenerationMode;
  quality: GenerationQuality;
  status: RunStatus;
  currentStage: string | null;
  progressPercent: number;
  inputPrompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRunRequest {
  prompt: string;
  mode?: GenerationMode;
  quality?: GenerationQuality;
  pageTarget?: number;
  constraints?: GenerationConstraints;
}

/** Valid status transitions for the run state machine. */
export const RUN_STATUS_TRANSITIONS: Record<RunStatus, RunStatus[]> = {
  queued: ['planning', 'cancelled', 'failed'],
  planning: ['generating_assets', 'paused', 'cancelled', 'failed'],
  generating_assets: ['generating_prose', 'paused', 'cancelled', 'failed'],
  generating_prose: ['evaluating', 'assembling', 'paused', 'cancelled', 'failed'],
  evaluating: ['revising', 'assembling', 'paused', 'cancelled', 'failed'],
  revising: ['evaluating', 'assembling', 'paused', 'cancelled', 'failed'],
  assembling: ['completed', 'failed'],
  completed: [],
  failed: [],
  paused: ['planning', 'generating_assets', 'generating_prose', 'evaluating', 'revising', 'assembling', 'cancelled'],
  cancelled: [],
};
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck --workspace=shared`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add shared/src/types/generation-run.ts
git commit -m "feat(shared): add GenerationRun types and status transitions"
```

---

## Task 2: Create shared GenerationTask types

**Files:**
- Create: `shared/src/types/generation-task.ts`

**Step 1: Create the types file**

```typescript
// shared/src/types/generation-task.ts

export type TaskStatus =
  | 'queued'
  | 'blocked'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskType =
  | 'normalize_input'
  | 'generate_campaign_bible'
  | 'generate_chapter_outline'
  | 'generate_chapter_plan'
  | 'generate_npc_dossier'
  | 'generate_location_brief'
  | 'generate_faction_profile'
  | 'generate_encounter_bundle'
  | 'generate_item_bundle'
  | 'generate_chapter_draft'
  | 'generate_appendix_draft'
  | 'generate_front_matter'
  | 'generate_back_matter'
  | 'evaluate_artifact'
  | 'revise_artifact'
  | 'assemble_documents'
  | 'run_preflight';

export interface GenerationTask {
  id: string;
  runId: string;
  parentTaskId: string | null;
  taskType: TaskType;
  artifactType: string | null;
  artifactKey: string | null;
  status: TaskStatus;
  priority: number;
  attemptCount: number;
  maxAttempts: number;
  dependsOn: string[];
  inputPayload: unknown | null;
  resultPayload: unknown | null;
  errorMessage: string | null;
  tokenCount: number | null;
  costEstimate: number | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateTaskInput {
  runId: string;
  parentTaskId?: string;
  taskType: TaskType;
  artifactType?: string;
  artifactKey?: string;
  priority?: number;
  maxAttempts?: number;
  dependsOn?: string[];
  inputPayload?: unknown;
}

/** Valid status transitions for the task state machine. */
export const TASK_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  queued: ['blocked', 'running', 'cancelled'],
  blocked: ['queued', 'running', 'cancelled'],
  running: ['completed', 'failed', 'cancelled'],
  completed: [],
  failed: ['queued'],   // retry: failed → queued
  cancelled: [],
};
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck --workspace=shared`
Expected: PASS

**Step 3: Commit**

```bash
git add shared/src/types/generation-task.ts
git commit -m "feat(shared): add GenerationTask types with DAG support"
```

---

## Task 3: Create shared artifact, evaluation, canon, bible, assembly, and project-document types

**Files:**
- Create: `shared/src/types/generated-artifact.ts`
- Create: `shared/src/types/artifact-evaluation.ts`
- Create: `shared/src/types/canon-entity.ts`
- Create: `shared/src/types/campaign-bible.ts`
- Create: `shared/src/types/assembly-manifest.ts`
- Create: `shared/src/types/project-document.ts`

**Step 1: Create all six type files**

```typescript
// shared/src/types/generated-artifact.ts

export type ArtifactStatus =
  | 'queued'
  | 'generating'
  | 'generated'
  | 'evaluating'
  | 'passed'
  | 'failed_evaluation'
  | 'revising'
  | 'accepted'
  | 'rejected'
  | 'assembled';

export type ArtifactCategory = 'planning' | 'reference' | 'written' | 'evaluation' | 'assembly';

export type ArtifactType =
  // Planning
  | 'project_profile'
  | 'campaign_bible'
  | 'chapter_outline'
  | 'chapter_plan'
  | 'section_spec'
  | 'appendix_plan'
  // Reference
  | 'npc_dossier'
  | 'location_brief'
  | 'faction_profile'
  | 'quest_arc'
  | 'item_bundle'
  | 'monster_bundle'
  | 'encounter_bundle'
  // Written
  | 'chapter_draft'
  | 'section_draft'
  | 'appendix_draft'
  | 'front_matter_draft'
  | 'back_matter_draft'
  | 'sidebar_bundle'
  | 'read_aloud_bundle'
  | 'handout_bundle'
  // Evaluation
  | 'artifact_evaluation'
  | 'continuity_report'
  | 'preflight_report'
  // Assembly
  | 'assembly_manifest';

export const ARTIFACT_CATEGORY_MAP: Record<ArtifactType, ArtifactCategory> = {
  project_profile: 'planning',
  campaign_bible: 'planning',
  chapter_outline: 'planning',
  chapter_plan: 'planning',
  section_spec: 'planning',
  appendix_plan: 'planning',
  npc_dossier: 'reference',
  location_brief: 'reference',
  faction_profile: 'reference',
  quest_arc: 'reference',
  item_bundle: 'reference',
  monster_bundle: 'reference',
  encounter_bundle: 'reference',
  chapter_draft: 'written',
  section_draft: 'written',
  appendix_draft: 'written',
  front_matter_draft: 'written',
  back_matter_draft: 'written',
  sidebar_bundle: 'written',
  read_aloud_bundle: 'written',
  handout_bundle: 'written',
  artifact_evaluation: 'evaluation',
  continuity_report: 'evaluation',
  preflight_report: 'evaluation',
  assembly_manifest: 'assembly',
};

export interface GeneratedArtifact {
  id: string;
  runId: string;
  projectId: string;
  sourceTaskId: string | null;
  artifactType: ArtifactType;
  artifactKey: string;
  parentArtifactId: string | null;
  status: ArtifactStatus;
  version: number;
  title: string;
  summary: string | null;
  jsonContent: unknown | null;
  markdownContent: string | null;
  tiptapContent: unknown | null;
  metadata: unknown | null;
  pageEstimate: number | null;
  tokenCount: number | null;
  createdAt: string;
  updatedAt: string;
}
```

```typescript
// shared/src/types/artifact-evaluation.ts

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

/** Weighted scoring config per artifact category. */
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
```

```typescript
// shared/src/types/canon-entity.ts

export type CanonEntityType =
  | 'npc'
  | 'location'
  | 'faction'
  | 'item'
  | 'quest'
  | 'monster'
  | 'encounter';

export type CanonReferenceType =
  | 'introduces'
  | 'mentions'
  | 'resolves'
  | 'depends_on';

export interface CanonEntity {
  id: string;
  projectId: string;
  runId: string;
  entityType: CanonEntityType;
  slug: string;
  canonicalName: string;
  aliases: string[];
  canonicalData: unknown;
  summary: string;
  sourceArtifactId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CanonReference {
  id: string;
  entityId: string;
  artifactId: string;
  referenceType: CanonReferenceType;
  metadata: unknown | null;
}
```

```typescript
// shared/src/types/campaign-bible.ts

export interface CampaignBible {
  id: string;
  runId: string;
  projectId: string;
  version: number;
  title: string;
  summary: string;
  premise: string | null;
  worldRules: unknown | null;
  actStructure: unknown | null;
  timeline: unknown | null;
  levelProgression: unknown | null;
  pageBudget: unknown | null;
  styleGuide: unknown | null;
  openThreads: unknown | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
```

```typescript
// shared/src/types/assembly-manifest.ts

export interface AssemblyDocumentSpec {
  documentSlug: string;
  title: string;
  kind: 'front_matter' | 'chapter' | 'appendix' | 'back_matter';
  artifactKeys: string[];
  sortOrder: number;
  targetPageCount?: number;
}

export interface AssemblyManifest {
  id: string;
  runId: string;
  projectId: string;
  version: number;
  documents: AssemblyDocumentSpec[];
  assemblyRules: unknown | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}
```

```typescript
// shared/src/types/project-document.ts

export type DocumentKind = 'front_matter' | 'chapter' | 'appendix' | 'back_matter';

export interface ProjectDocument {
  id: string;
  projectId: string;
  runId: string | null;
  kind: DocumentKind;
  title: string;
  slug: string;
  sortOrder: number;
  targetPageCount: number | null;
  outlineJson: unknown | null;
  content: unknown;
  status: string;
  sourceArtifactId: string | null;
  createdAt: string;
  updatedAt: string;
}
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck --workspace=shared`
Expected: PASS

**Step 3: Commit**

```bash
git add shared/src/types/generated-artifact.ts shared/src/types/artifact-evaluation.ts shared/src/types/canon-entity.ts shared/src/types/campaign-bible.ts shared/src/types/assembly-manifest.ts shared/src/types/project-document.ts
git commit -m "feat(shared): add artifact, evaluation, canon, bible, assembly, and project-document types"
```

---

## Task 4: Create shared SSE event types for generation progress

**Files:**
- Create: `shared/src/types/generation-events.ts`

**Step 1: Create the event types file**

```typescript
// shared/src/types/generation-events.ts

import type { RunStatus } from './generation-run';
import type { TaskStatus } from './generation-task';
import type { ArtifactStatus } from './generated-artifact';

export type GenerationEvent =
  | { type: 'run_status'; runId: string; status: RunStatus; stage: string | null; progressPercent: number }
  | { type: 'task_started'; runId: string; taskId: string; taskType: string }
  | { type: 'task_completed'; runId: string; taskId: string; taskType: string; status: TaskStatus }
  | { type: 'artifact_created'; runId: string; artifactId: string; artifactType: string; title: string; version: number }
  | { type: 'artifact_evaluated'; runId: string; artifactId: string; passed: boolean; overallScore: number }
  | { type: 'run_warning'; runId: string; message: string; severity: 'info' | 'warning' | 'error' }
  | { type: 'run_completed'; runId: string }
  | { type: 'run_failed'; runId: string; reason: string };
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck --workspace=shared`
Expected: PASS

**Step 3: Commit**

```bash
git add shared/src/types/generation-events.ts
git commit -m "feat(shared): add SSE event types for generation progress"
```

---

## Task 5: Export all new types from shared index

**Files:**
- Modify: `shared/src/index.ts`

**Step 1: Add exports**

Add these lines to the end of `shared/src/index.ts`:

```typescript
export * from './types/generation-run';
export * from './types/generation-task';
export * from './types/generated-artifact';
export * from './types/artifact-evaluation';
export * from './types/canon-entity';
export * from './types/campaign-bible';
export * from './types/assembly-manifest';
export * from './types/project-document';
export * from './types/generation-events';
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck --workspace=shared`
Expected: PASS

**Step 3: Commit**

```bash
git add shared/src/index.ts
git commit -m "feat(shared): export generation domain types from index"
```

---

## Task 6: Add Prisma enums for generation domain

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add the enums at the top of the schema (after the datasource block, before existing models)**

Add these enum definitions after line 8 (after `datasource db { ... }`) and before line 10 (`model User`):

```prisma
enum RunStatus {
  queued
  planning
  generating_assets
  generating_prose
  evaluating
  revising
  assembling
  completed
  failed
  paused
  cancelled
}

enum GenerationMode {
  one_shot
  module
  campaign
  sourcebook
}

enum GenerationQuality {
  quick
  polished
}

enum TaskStatus {
  queued
  blocked
  running
  completed
  failed
  cancelled
}

enum ArtifactStatus {
  queued
  generating
  generated
  evaluating
  passed
  failed_evaluation
  revising
  accepted
  rejected
  assembled
}

enum DocumentKind {
  front_matter
  chapter
  appendix
  back_matter
}
```

**Step 2: Verify the schema is valid**

Run: `cd server && npx prisma validate --schema=prisma/schema.prisma`
Expected: "The schema at `prisma/schema.prisma` is valid"

**Step 3: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(prisma): add generation domain enums"
```

---

## Task 7: Add Prisma models — GenerationRun, GenerationTask

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add GenerationRun and GenerationTask models**

Add these models after the new enums in the schema:

```prisma
model GenerationRun {
  id              String            @id @default(uuid())
  projectId       String            @map("project_id")
  userId          String            @map("user_id")
  mode            GenerationMode
  quality         GenerationQuality @default(quick)
  status          RunStatus         @default(queued)
  currentStage    String?           @map("current_stage")
  inputPrompt     String            @map("input_prompt")
  inputParameters Json?             @map("input_parameters")
  progressPercent Int               @default(0) @map("progress_percent")
  estimatedPages  Int?              @map("estimated_pages")
  estimatedTokens Int?              @map("estimated_tokens")
  estimatedCost   Float?            @map("estimated_cost")
  actualTokens    Int               @default(0) @map("actual_tokens")
  actualCost      Float             @default(0) @map("actual_cost")
  failureReason   String?           @map("failure_reason")
  metricsJson     Json?             @map("metrics_json")
  createdAt       DateTime          @default(now()) @map("created_at")
  updatedAt       DateTime          @updatedAt @map("updated_at")
  startedAt       DateTime?         @map("started_at")
  completedAt     DateTime?         @map("completed_at")

  project         Project           @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user            User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  tasks           GenerationTask[]
  bible           CampaignBible?
  artifacts       GeneratedArtifact[]
  canonEntities   CanonEntity[]
  manifests       AssemblyManifest[]

  @@index([projectId])
  @@index([userId])
  @@index([status])
  @@map("generation_runs")
}

model GenerationTask {
  id              String      @id @default(uuid())
  runId           String      @map("run_id")
  parentTaskId    String?     @map("parent_task_id")
  taskType        String      @map("task_type")
  artifactType    String?     @map("artifact_type")
  artifactKey     String?     @map("artifact_key")
  status          TaskStatus  @default(queued)
  priority        Int         @default(0)
  attemptCount    Int         @default(0) @map("attempt_count")
  maxAttempts     Int         @default(2) @map("max_attempts")
  dependsOn       Json        @default("[]") @map("depends_on")
  inputPayload    Json?       @map("input_payload")
  resultPayload   Json?       @map("result_payload")
  errorMessage    String?     @map("error_message")
  tokenCount      Int?        @map("token_count")
  costEstimate    Float?      @map("cost_estimate")
  startedAt       DateTime?   @map("started_at")
  completedAt     DateTime?   @map("completed_at")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  run             GenerationRun  @relation(fields: [runId], references: [id], onDelete: Cascade)
  parentTask      GenerationTask? @relation("TaskParent", fields: [parentTaskId], references: [id])
  childTasks      GenerationTask[] @relation("TaskParent")

  @@index([runId])
  @@index([runId, status])
  @@index([parentTaskId])
  @@map("generation_tasks")
}
```

**Step 2: Add the `generationRuns` relation to existing User and Project models**

In the `User` model (after line 34 `taskPlans AiTaskPlan[]`), add:

```prisma
  generationRuns  GenerationRun[]
```

In the `Project` model (after line 74 `contentChunks ContentChunk[]`), add:

```prisma
  generationRuns  GenerationRun[]
```

**Step 3: Validate**

Run: `cd server && npx prisma validate --schema=prisma/schema.prisma`
Expected: Valid

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(prisma): add GenerationRun and GenerationTask models"
```

---

## Task 8: Add Prisma models — CampaignBible, CanonEntity, CanonReference

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add the three models after GenerationTask**

```prisma
model CampaignBible {
  id              String    @id @default(uuid())
  runId           String    @unique @map("run_id")
  projectId       String    @map("project_id")
  version         Int       @default(1)
  title           String
  summary         String
  premise         String?
  worldRules      Json?     @map("world_rules")
  actStructure    Json?     @map("act_structure")
  timeline        Json?
  levelProgression Json?    @map("level_progression")
  pageBudget      Json?     @map("page_budget")
  styleGuide      Json?     @map("style_guide")
  openThreads     Json?     @map("open_threads")
  status          String    @default("draft")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  run             GenerationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  project         Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@map("campaign_bibles")
}

model CanonEntity {
  id              String    @id @default(uuid())
  projectId       String    @map("project_id")
  runId           String    @map("run_id")
  entityType      String    @map("entity_type")
  slug            String
  canonicalName   String    @map("canonical_name")
  aliases         Json      @default("[]")
  canonicalData   Json      @map("canonical_data")
  summary         String
  sourceArtifactId String?  @map("source_artifact_id")
  status          String    @default("active")
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  project         Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)
  run             GenerationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  references      CanonReference[]

  @@unique([runId, entityType, slug])
  @@index([projectId])
  @@index([runId])
  @@index([entityType])
  @@map("canon_entities")
}

model CanonReference {
  id              String    @id @default(uuid())
  entityId        String    @map("entity_id")
  artifactId      String    @map("artifact_id")
  referenceType   String    @map("reference_type")
  metadata        Json?

  entity          CanonEntity @relation(fields: [entityId], references: [id], onDelete: Cascade)
  artifact        GeneratedArtifact @relation(fields: [artifactId], references: [id], onDelete: Cascade)

  @@index([entityId])
  @@index([artifactId])
  @@map("canon_references")
}
```

**Step 2: Add relations to Project model**

In the `Project` model, after the `generationRuns` line added in Task 7, add:

```prisma
  campaignBibles  CampaignBible[]
  canonEntities   CanonEntity[]
```

**Step 3: Validate**

Run: `cd server && npx prisma validate --schema=prisma/schema.prisma`
Expected: Valid

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(prisma): add CampaignBible, CanonEntity, CanonReference models"
```

---

## Task 9: Add Prisma models — GeneratedArtifact, ArtifactEvaluation, ArtifactRevision

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add the three models**

```prisma
model GeneratedArtifact {
  id               String         @id @default(uuid())
  runId            String         @map("run_id")
  projectId        String         @map("project_id")
  sourceTaskId     String?        @map("source_task_id")
  artifactType     String         @map("artifact_type")
  artifactKey      String         @map("artifact_key")
  parentArtifactId String?        @map("parent_artifact_id")
  status           ArtifactStatus @default(queued)
  version          Int            @default(1)
  title            String
  summary          String?
  jsonContent      Json?          @map("json_content")
  markdownContent  String?        @map("markdown_content")
  tiptapContent    Json?          @map("tiptap_content")
  metadata         Json?
  pageEstimate     Int?           @map("page_estimate")
  tokenCount       Int?           @map("token_count")
  createdAt        DateTime       @default(now()) @map("created_at")
  updatedAt        DateTime       @updatedAt @map("updated_at")

  run              GenerationRun  @relation(fields: [runId], references: [id], onDelete: Cascade)
  project          Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parentArtifact   GeneratedArtifact? @relation("ArtifactParent", fields: [parentArtifactId], references: [id])
  childArtifacts   GeneratedArtifact[] @relation("ArtifactParent")
  evaluations      ArtifactEvaluation[]
  revisions        ArtifactRevision[] @relation("RevisionTarget")
  canonReferences  CanonReference[]

  @@unique([runId, artifactType, artifactKey, version])
  @@index([runId])
  @@index([projectId])
  @@index([artifactType])
  @@index([status])
  @@map("generated_artifacts")
}

model ArtifactEvaluation {
  id                     String   @id @default(uuid())
  artifactId             String   @map("artifact_id")
  artifactVersion        Int      @map("artifact_version")
  evaluationType         String   @map("evaluation_type")
  overallScore           Float    @map("overall_score")
  structuralCompleteness Float?   @map("structural_completeness")
  continuityScore        Float?   @map("continuity_score")
  dndSanity              Float?   @map("dnd_sanity")
  editorialQuality       Float?   @map("editorial_quality")
  publicationFit         Float?   @map("publication_fit")
  passed                 Boolean
  findings               Json
  recommendedActions     Json?    @map("recommended_actions")
  evaluatorModel         String?  @map("evaluator_model")
  tokenCount             Int?     @map("token_count")
  createdAt              DateTime @default(now()) @map("created_at")

  artifact               GeneratedArtifact @relation(fields: [artifactId], references: [id], onDelete: Cascade)

  @@index([artifactId])
  @@map("artifact_evaluations")
}

model ArtifactRevision {
  id              String   @id @default(uuid())
  artifactId      String   @map("artifact_id")
  fromVersion     Int      @map("from_version")
  toVersion       Int      @map("to_version")
  reason          String
  findingCodes    Json?    @map("finding_codes")
  revisionPrompt  String?  @map("revision_prompt")
  tokenCount      Int?     @map("token_count")
  createdAt       DateTime @default(now()) @map("created_at")

  artifact        GeneratedArtifact @relation("RevisionTarget", fields: [artifactId], references: [id], onDelete: Cascade)

  @@index([artifactId])
  @@map("artifact_revisions")
}
```

**Step 2: Add relation to Project model**

In the `Project` model, add after `canonEntities`:

```prisma
  artifacts       GeneratedArtifact[]
```

**Step 3: Validate**

Run: `cd server && npx prisma validate --schema=prisma/schema.prisma`
Expected: Valid

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(prisma): add GeneratedArtifact, ArtifactEvaluation, ArtifactRevision models"
```

---

## Task 10: Add Prisma models — AssemblyManifest, ProjectDocument

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add the two models**

```prisma
model AssemblyManifest {
  id            String    @id @default(uuid())
  runId         String    @map("run_id")
  projectId     String    @map("project_id")
  version       Int       @default(1)
  documents     Json
  assemblyRules Json?     @map("assembly_rules")
  status        String    @default("draft")
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  run           GenerationRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@map("assembly_manifests")
}

model ProjectDocument {
  id               String       @id @default(uuid())
  projectId        String       @map("project_id")
  runId            String?      @map("run_id")
  kind             DocumentKind
  title            String
  slug             String
  sortOrder        Int          @map("sort_order")
  targetPageCount  Int?         @map("target_page_count")
  outlineJson      Json?        @map("outline_json")
  content          Json         @default("{}")
  status           String       @default("draft")
  sourceArtifactId String?      @map("source_artifact_id")
  createdAt        DateTime     @default(now()) @map("created_at")
  updatedAt        DateTime     @updatedAt @map("updated_at")

  project          Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, slug])
  @@index([projectId])
  @@index([projectId, sortOrder])
  @@map("project_documents")
}
```

**Step 2: Add relation to Project model**

In the `Project` model, add after `artifacts`:

```prisma
  documents       ProjectDocument[]
```

**Step 3: Validate**

Run: `cd server && npx prisma validate --schema=prisma/schema.prisma`
Expected: Valid

**Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat(prisma): add AssemblyManifest and ProjectDocument models"
```

---

## Task 11: Run Prisma migration

**Files:**
- Generated: `server/prisma/migrations/YYYYMMDDHHMMSS_add_generation_domain/migration.sql`

**Step 1: Generate and apply the migration**

Run: `cd server && npx prisma migrate dev --name add_generation_domain --schema=prisma/schema.prisma`

Expected: Migration creates tables `generation_runs`, `generation_tasks`, `campaign_bibles`, `canon_entities`, `canon_references`, `generated_artifacts`, `artifact_evaluations`, `artifact_revisions`, `assembly_manifests`, `project_documents` with all indexes and constraints.

**Step 2: Generate Prisma client**

Run: `cd server && npx prisma generate --schema=prisma/schema.prisma`
Expected: "Generated Prisma Client"

**Step 3: Verify server typechecks**

Run: `cd server && npx tsc --noEmit`
Expected: PASS (no errors related to new models)

**Step 4: Commit**

```bash
git add server/prisma/migrations/ server/prisma/schema.prisma
git commit -m "feat(prisma): migration add_generation_domain — 10 new tables"
```

---

## Task 12: Write failing tests for GenerationRun service — create and get

**Files:**
- Create: `server/src/__tests__/generation/run.test.ts`

**Step 1: Write the test file**

```typescript
// server/src/__tests__/generation/run.test.ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from '../../config/database.js';

// Will be created in Task 13
import {
  createRun,
  getRun,
  listRuns,
  transitionRunStatus,
} from '../../services/generation/run.service.js';

const TEST_USER = {
  email: 'gen-run-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Gen Run Test',
};

let userId: string;
let projectId: string;

describe('GenerationRun Service', () => {
  beforeAll(async () => {
    // Clean up
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    // Create test user and project
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash(TEST_USER.password, 4);
    const user = await prisma.user.create({
      data: { email: TEST_USER.email, passwordHash: hash, displayName: TEST_USER.displayName },
    });
    userId = user.id;

    const project = await prisma.project.create({
      data: { userId, title: 'Gen Test Project', type: 'one_shot' },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    await prisma.$disconnect();
  });

  describe('createRun', () => {
    it('should create a run with defaults', async () => {
      const run = await createRun({
        projectId,
        userId,
        prompt: 'A goblin cave one-shot for level 4 characters',
      });

      expect(run.id).toBeDefined();
      expect(run.status).toBe('queued');
      expect(run.mode).toBe('one_shot');
      expect(run.quality).toBe('quick');
      expect(run.inputPrompt).toBe('A goblin cave one-shot for level 4 characters');
      expect(run.progressPercent).toBe(0);
      expect(run.actualTokens).toBe(0);
      expect(run.actualCost).toBe(0);
    });

    it('should create a run with explicit mode and quality', async () => {
      const run = await createRun({
        projectId,
        userId,
        prompt: 'Gothic horror campaign',
        mode: 'campaign',
        quality: 'polished',
        pageTarget: 120,
        constraints: { tone: 'gothic horror', levelRange: '3-10' },
      });

      expect(run.mode).toBe('campaign');
      expect(run.quality).toBe('polished');
      expect(run.estimatedPages).toBe(120);
      expect(run.inputParameters).toEqual({ tone: 'gothic horror', levelRange: '3-10' });
    });

    it('should reject creation for a project the user does not own', async () => {
      const result = await createRun({
        projectId,
        userId: '00000000-0000-0000-0000-000000000000',
        prompt: 'Should fail',
      });

      expect(result).toBeNull();
    });
  });

  describe('getRun', () => {
    it('should return a run by id for the owning user', async () => {
      const created = await createRun({
        projectId,
        userId,
        prompt: 'Get test',
      });

      const fetched = await getRun(created!.id, userId);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created!.id);
    });

    it('should return null for another user', async () => {
      const created = await createRun({
        projectId,
        userId,
        prompt: 'Ownership test',
      });

      const fetched = await getRun(created!.id, '00000000-0000-0000-0000-000000000000');
      expect(fetched).toBeNull();
    });
  });

  describe('listRuns', () => {
    it('should list runs for a project', async () => {
      const runs = await listRuns(projectId, userId);
      expect(runs).not.toBeNull();
      expect(Array.isArray(runs)).toBe(true);
      expect(runs!.length).toBeGreaterThan(0);
    });

    it('should return null if user does not own the project', async () => {
      const runs = await listRuns(projectId, '00000000-0000-0000-0000-000000000000');
      expect(runs).toBeNull();
    });
  });

  describe('transitionRunStatus', () => {
    it('should allow queued → planning', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Transition test' });
      const updated = await transitionRunStatus(run!.id, userId, 'planning');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('planning');
      expect(updated!.startedAt).not.toBeNull();
    });

    it('should allow planning → paused', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Pause test' });
      await transitionRunStatus(run!.id, userId, 'planning');
      const updated = await transitionRunStatus(run!.id, userId, 'paused');
      expect(updated!.status).toBe('paused');
    });

    it('should reject invalid transitions (queued → completed)', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Invalid transition' });
      const result = await transitionRunStatus(run!.id, userId, 'completed');
      expect(result).toBeNull();
    });

    it('should set completedAt when reaching completed', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Complete test' });
      await transitionRunStatus(run!.id, userId, 'planning');
      await transitionRunStatus(run!.id, userId, 'generating_assets');
      await transitionRunStatus(run!.id, userId, 'generating_prose');
      await transitionRunStatus(run!.id, userId, 'assembling');
      const completed = await transitionRunStatus(run!.id, userId, 'completed');
      expect(completed!.status).toBe('completed');
      expect(completed!.completedAt).not.toBeNull();
    });

    it('should set failureReason when reaching failed', async () => {
      const run = await createRun({ projectId, userId, prompt: 'Fail test' });
      const failed = await transitionRunStatus(run!.id, userId, 'failed', 'Provider returned 500');
      expect(failed!.status).toBe('failed');
      expect(failed!.failureReason).toBe('Provider returned 500');
    });
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/generation/run.test.ts`
Expected: FAIL — cannot resolve `../../services/generation/run.service.js`

**Step 3: Commit**

```bash
git add server/src/__tests__/generation/run.test.ts
git commit -m "test: add failing tests for GenerationRun service"
```

---

## Task 13: Implement GenerationRun service

**Files:**
- Create: `server/src/services/generation/run.service.ts`

**Step 1: Implement the service**

```typescript
// server/src/services/generation/run.service.ts
import { prisma } from '../../config/database.js';
import type { RunStatus, GenerationMode, GenerationQuality, GenerationConstraints } from '@dnd-booker/shared';
import { RUN_STATUS_TRANSITIONS } from '@dnd-booker/shared';

interface CreateRunInput {
  projectId: string;
  userId: string;
  prompt: string;
  mode?: GenerationMode;
  quality?: GenerationQuality;
  pageTarget?: number;
  constraints?: GenerationConstraints;
}

export async function createRun(input: CreateRunInput) {
  // Verify project ownership
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
  });
  if (!project) return null;

  return prisma.generationRun.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      mode: input.mode ?? 'one_shot',
      quality: input.quality ?? 'quick',
      inputPrompt: input.prompt,
      inputParameters: input.constraints ?? undefined,
      estimatedPages: input.pageTarget ?? null,
    },
  });
}

export async function getRun(runId: string, userId: string) {
  return prisma.generationRun.findFirst({
    where: { id: runId, userId },
  });
}

export async function listRuns(projectId: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
  });
  if (!project) return null;

  return prisma.generationRun.findMany({
    where: { projectId, userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function transitionRunStatus(
  runId: string,
  userId: string,
  newStatus: RunStatus,
  failureReason?: string,
) {
  const run = await prisma.generationRun.findFirst({
    where: { id: runId, userId },
  });
  if (!run) return null;

  const allowed = RUN_STATUS_TRANSITIONS[run.status as RunStatus];
  if (!allowed || !allowed.includes(newStatus)) return null;

  const now = new Date();
  const data: Record<string, unknown> = { status: newStatus };

  // Set startedAt on first transition out of queued
  if (run.status === 'queued' && !run.startedAt) {
    data.startedAt = now;
  }

  // Set completedAt on terminal states
  if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
    data.completedAt = now;
  }

  if (newStatus === 'failed' && failureReason) {
    data.failureReason = failureReason;
  }

  // Track the current stage for non-terminal, non-paused states
  if (!['completed', 'failed', 'cancelled', 'paused', 'queued'].includes(newStatus)) {
    data.currentStage = newStatus;
  }

  return prisma.generationRun.update({
    where: { id: runId },
    data,
  });
}
```

**Step 2: Run the tests**

Run: `cd server && npx vitest run src/__tests__/generation/run.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add server/src/services/generation/run.service.ts
git commit -m "feat: implement GenerationRun service with CRUD and state machine"
```

---

## Task 14: Write failing tests for GenerationTask service

**Files:**
- Create: `server/src/__tests__/generation/task.test.ts`

**Step 1: Write the test file**

```typescript
// server/src/__tests__/generation/task.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../config/database.js';
import { createRun } from '../../services/generation/run.service.js';

// Will be created in Task 15
import {
  createTask,
  getTask,
  listTasksForRun,
  transitionTaskStatus,
  getReadyTasks,
} from '../../services/generation/task.service.js';

const TEST_USER = {
  email: 'gen-task-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Gen Task Test',
};

let userId: string;
let projectId: string;
let runId: string;

describe('GenerationTask Service', () => {
  beforeAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash(TEST_USER.password, 4);
    const user = await prisma.user.create({
      data: { email: TEST_USER.email, passwordHash: hash, displayName: TEST_USER.displayName },
    });
    userId = user.id;

    const project = await prisma.project.create({
      data: { userId, title: 'Task Test Project', type: 'one_shot' },
    });
    projectId = project.id;

    const run = await createRun({ projectId, userId, prompt: 'Task test run' });
    runId = run!.id;
  });

  afterAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    await prisma.$disconnect();
  });

  describe('createTask', () => {
    it('should create a task with defaults', async () => {
      const task = await createTask({
        runId,
        taskType: 'normalize_input',
      });

      expect(task.id).toBeDefined();
      expect(task.runId).toBe(runId);
      expect(task.taskType).toBe('normalize_input');
      expect(task.status).toBe('queued');
      expect(task.attemptCount).toBe(0);
      expect(task.maxAttempts).toBe(2);
      expect(task.dependsOn).toEqual([]);
    });

    it('should create a task with dependencies', async () => {
      const parentTask = await createTask({ runId, taskType: 'generate_campaign_bible' });
      const childTask = await createTask({
        runId,
        taskType: 'generate_chapter_outline',
        dependsOn: [parentTask.id],
      });

      expect(childTask.dependsOn).toEqual([parentTask.id]);
      expect(childTask.status).toBe('blocked');
    });
  });

  describe('getTask', () => {
    it('should return a task by id', async () => {
      const created = await createTask({ runId, taskType: 'normalize_input' });
      const fetched = await getTask(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
    });
  });

  describe('listTasksForRun', () => {
    it('should list all tasks for a run', async () => {
      const tasks = await listTasksForRun(runId);
      expect(tasks.length).toBeGreaterThan(0);
    });
  });

  describe('transitionTaskStatus', () => {
    it('should allow queued → running', async () => {
      const task = await createTask({ runId, taskType: 'normalize_input' });
      const updated = await transitionTaskStatus(task.id, 'running');
      expect(updated).not.toBeNull();
      expect(updated!.status).toBe('running');
      expect(updated!.startedAt).not.toBeNull();
    });

    it('should allow running → completed', async () => {
      const task = await createTask({ runId, taskType: 'normalize_input' });
      await transitionTaskStatus(task.id, 'running');
      const updated = await transitionTaskStatus(task.id, 'completed');
      expect(updated!.status).toBe('completed');
      expect(updated!.completedAt).not.toBeNull();
    });

    it('should increment attemptCount on running → failed → queued retry', async () => {
      const task = await createTask({ runId, taskType: 'normalize_input', maxAttempts: 3 });
      await transitionTaskStatus(task.id, 'running');
      const failed = await transitionTaskStatus(task.id, 'failed', 'Provider timeout');
      expect(failed!.status).toBe('failed');
      expect(failed!.errorMessage).toBe('Provider timeout');

      const retried = await transitionTaskStatus(task.id, 'queued');
      expect(retried!.status).toBe('queued');
      expect(retried!.attemptCount).toBe(1);
    });

    it('should reject invalid transitions', async () => {
      const task = await createTask({ runId, taskType: 'normalize_input' });
      const result = await transitionTaskStatus(task.id, 'completed');
      expect(result).toBeNull();
    });
  });

  describe('getReadyTasks', () => {
    it('should return queued tasks with no dependencies', async () => {
      // Create a fresh run to isolate this test
      const freshRun = await createRun({ projectId, userId, prompt: 'Ready tasks test' });
      const task = await createTask({ runId: freshRun!.id, taskType: 'normalize_input' });

      const ready = await getReadyTasks(freshRun!.id);
      expect(ready.some((t) => t.id === task.id)).toBe(true);
    });

    it('should not return blocked tasks whose deps are incomplete', async () => {
      const freshRun = await createRun({ projectId, userId, prompt: 'Blocked test' });
      const parent = await createTask({ runId: freshRun!.id, taskType: 'normalize_input' });
      const child = await createTask({
        runId: freshRun!.id,
        taskType: 'generate_campaign_bible',
        dependsOn: [parent.id],
      });

      const ready = await getReadyTasks(freshRun!.id);
      expect(ready.some((t) => t.id === child.id)).toBe(false);
      expect(ready.some((t) => t.id === parent.id)).toBe(true);
    });

    it('should unblock tasks whose deps are all completed', async () => {
      const freshRun = await createRun({ projectId, userId, prompt: 'Unblock test' });
      const parent = await createTask({ runId: freshRun!.id, taskType: 'normalize_input' });
      const child = await createTask({
        runId: freshRun!.id,
        taskType: 'generate_campaign_bible',
        dependsOn: [parent.id],
      });

      // Complete the parent
      await transitionTaskStatus(parent.id, 'running');
      await transitionTaskStatus(parent.id, 'completed');

      const ready = await getReadyTasks(freshRun!.id);
      expect(ready.some((t) => t.id === child.id)).toBe(true);
    });
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/generation/task.test.ts`
Expected: FAIL — cannot resolve `../../services/generation/task.service.js`

**Step 3: Commit**

```bash
git add server/src/__tests__/generation/task.test.ts
git commit -m "test: add failing tests for GenerationTask service"
```

---

## Task 15: Implement GenerationTask service

**Files:**
- Create: `server/src/services/generation/task.service.ts`

**Step 1: Implement the service**

```typescript
// server/src/services/generation/task.service.ts
import { prisma } from '../../config/database.js';
import type { TaskStatus, TaskType } from '@dnd-booker/shared';
import { TASK_STATUS_TRANSITIONS } from '@dnd-booker/shared';

interface CreateTaskInput {
  runId: string;
  parentTaskId?: string;
  taskType: TaskType | string;
  artifactType?: string;
  artifactKey?: string;
  priority?: number;
  maxAttempts?: number;
  dependsOn?: string[];
  inputPayload?: unknown;
}

export async function createTask(input: CreateTaskInput) {
  const hasDeps = input.dependsOn && input.dependsOn.length > 0;

  return prisma.generationTask.create({
    data: {
      runId: input.runId,
      parentTaskId: input.parentTaskId ?? null,
      taskType: input.taskType,
      artifactType: input.artifactType ?? null,
      artifactKey: input.artifactKey ?? null,
      priority: input.priority ?? 0,
      maxAttempts: input.maxAttempts ?? 2,
      dependsOn: input.dependsOn ?? [],
      inputPayload: input.inputPayload ?? undefined,
      status: hasDeps ? 'blocked' : 'queued',
    },
  });
}

export async function getTask(taskId: string) {
  return prisma.generationTask.findUnique({ where: { id: taskId } });
}

export async function listTasksForRun(runId: string) {
  return prisma.generationTask.findMany({
    where: { runId },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function transitionTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
  errorMessage?: string,
) {
  const task = await prisma.generationTask.findUnique({ where: { id: taskId } });
  if (!task) return null;

  const allowed = TASK_STATUS_TRANSITIONS[task.status as TaskStatus];
  if (!allowed || !allowed.includes(newStatus)) return null;

  const now = new Date();
  const data: Record<string, unknown> = { status: newStatus };

  if (newStatus === 'running' && !task.startedAt) {
    data.startedAt = now;
  }

  if (newStatus === 'completed' || newStatus === 'failed') {
    data.completedAt = now;
  }

  if (newStatus === 'failed' && errorMessage) {
    data.errorMessage = errorMessage;
  }

  // Retry: failed → queued increments attemptCount
  if (task.status === 'failed' && newStatus === 'queued') {
    data.attemptCount = task.attemptCount + 1;
    data.startedAt = null;
    data.completedAt = null;
  }

  return prisma.generationTask.update({
    where: { id: taskId },
    data,
  });
}

/**
 * Returns tasks that are ready to execute:
 * - status is 'queued' (no dependencies) OR
 * - status is 'blocked' but all dependsOn tasks are 'completed'
 *
 * For blocked tasks that become ready, transitions them to 'queued' first.
 */
export async function getReadyTasks(runId: string) {
  // Get all tasks for this run
  const allTasks = await prisma.generationTask.findMany({ where: { runId } });

  const completedIds = new Set(
    allTasks.filter((t) => t.status === 'completed').map((t) => t.id),
  );

  const ready: typeof allTasks = [];

  for (const task of allTasks) {
    if (task.status === 'queued') {
      ready.push(task);
      continue;
    }

    if (task.status === 'blocked') {
      const deps = task.dependsOn as string[];
      const allDepsComplete = deps.length > 0 && deps.every((id) => completedIds.has(id));
      if (allDepsComplete) {
        // Transition blocked → queued (allowed by state machine via blocked → queued)
        const unblocked = await prisma.generationTask.update({
          where: { id: task.id },
          data: { status: 'queued' },
        });
        ready.push(unblocked);
      }
    }
  }

  return ready;
}
```

**Step 2: Run the tests**

Run: `cd server && npx vitest run src/__tests__/generation/task.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add server/src/services/generation/task.service.ts
git commit -m "feat: implement GenerationTask service with DAG dependency resolution"
```

---

## Task 16: Write failing tests for generation run API routes

**Files:**
- Create: `server/src/__tests__/generation/routes.test.ts`

**Step 1: Write the test file**

```typescript
// server/src/__tests__/generation/routes.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../../index.js';
import { prisma } from '../../config/database.js';

const TEST_USER = {
  email: 'gen-routes-test@example.com',
  password: 'StrongP@ss1',
  displayName: 'Gen Routes Test',
};

let accessToken: string;
let userId: string;
let projectId: string;

describe('Generation Run Routes', () => {
  beforeAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }

    const res = await request(app).post('/api/auth/register').send(TEST_USER);
    accessToken = res.body.accessToken;
    userId = res.body.user.id;

    const projRes = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ title: 'Gen Route Project', type: 'one_shot' });
    projectId = projRes.body.id;
  });

  afterAll(async () => {
    const existing = await prisma.user.findUnique({ where: { email: TEST_USER.email } });
    if (existing) {
      await prisma.project.deleteMany({ where: { userId: existing.id } });
      await prisma.user.delete({ where: { id: existing.id } });
    }
    await prisma.$disconnect();
  });

  describe('POST /api/projects/:projectId/ai/generation-runs', () => {
    it('should create a run with valid input', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'A goblin cave adventure for level 4' });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe('queued');
      expect(res.body.mode).toBe('one_shot');
    });

    it('should reject missing prompt', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .send({ prompt: 'No auth' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/projects/:projectId/ai/generation-runs', () => {
    it('should list runs for the project', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  describe('GET /api/projects/:projectId/ai/generation-runs/:runId', () => {
    it('should return a run with tasks and artifacts counts', async () => {
      // Create a run first
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Detail test' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(createRes.body.id);
      expect(res.body.taskCount).toBeDefined();
      expect(res.body.artifactCount).toBeDefined();
    });

    it('should return 404 for non-existent run', async () => {
      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/projects/:projectId/ai/generation-runs/:runId/pause', () => {
    it('should pause a running (planning) run', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Pause test' });

      // Manually transition to planning for the test
      await prisma.generationRun.update({
        where: { id: createRes.body.id },
        data: { status: 'planning', startedAt: new Date() },
      });

      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}/pause`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('paused');
    });
  });

  describe('POST /api/projects/:projectId/ai/generation-runs/:runId/cancel', () => {
    it('should cancel a queued run', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Cancel test' });

      const res = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}/cancel`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });
  });

  describe('GET /api/projects/:projectId/ai/generation-runs/:runId/tasks', () => {
    it('should list tasks for a run', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Tasks list test' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}/tasks`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /api/projects/:projectId/ai/generation-runs/:runId/artifacts', () => {
    it('should list artifacts for a run', async () => {
      const createRes = await request(app)
        .post(`/api/projects/${projectId}/ai/generation-runs`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ prompt: 'Artifacts list test' });

      const res = await request(app)
        .get(`/api/projects/${projectId}/ai/generation-runs/${createRes.body.id}/artifacts`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/generation/routes.test.ts`
Expected: FAIL — routes don't exist yet, returns 404

**Step 3: Commit**

```bash
git add server/src/__tests__/generation/routes.test.ts
git commit -m "test: add failing tests for generation run API routes"
```

---

## Task 17: Implement generation routes and mount them

**Files:**
- Create: `server/src/routes/generation.ts`
- Modify: `server/src/index.ts`

**Step 1: Create the routes file**

```typescript
// server/src/routes/generation.ts
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/async-handler.js';
import { validateUuid } from '../middleware/validate-uuid.js';
import {
  createRun,
  getRun,
  listRuns,
  transitionRunStatus,
} from '../services/generation/run.service.js';
import { listTasksForRun } from '../services/generation/task.service.js';
import { prisma } from '../config/database.js';

const generationRoutes = Router({ mergeParams: true });

const createRunSchema = z.object({
  prompt: z.string().min(1).max(5000),
  mode: z.enum(['one_shot', 'module', 'campaign', 'sourcebook']).optional(),
  quality: z.enum(['quick', 'polished']).optional(),
  pageTarget: z.number().int().min(1).max(500).optional(),
  constraints: z.object({
    tone: z.string().optional(),
    levelRange: z.string().optional(),
    settingPreference: z.string().optional(),
    includeHandouts: z.boolean().optional(),
    includeMaps: z.boolean().optional(),
    strict5e: z.boolean().optional(),
  }).optional(),
});

// POST /api/projects/:projectId/ai/generation-runs — Create a run
generationRoutes.post(
  '/ai/generation-runs',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { projectId } = req.params;

    const parsed = createRunSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
      return;
    }

    const run = await createRun({
      projectId,
      userId: authReq.userId!,
      prompt: parsed.data.prompt,
      mode: parsed.data.mode,
      quality: parsed.data.quality,
      pageTarget: parsed.data.pageTarget,
      constraints: parsed.data.constraints,
    });

    if (!run) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.status(201).json(run);
  }),
);

// GET /api/projects/:projectId/ai/generation-runs — List runs
generationRoutes.get(
  '/ai/generation-runs',
  requireAuth,
  validateUuid('projectId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { projectId } = req.params;

    const runs = await listRuns(projectId, authReq.userId!);
    if (!runs) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    res.json(runs);
  }),
);

// GET /api/projects/:projectId/ai/generation-runs/:runId — Run detail
generationRoutes.get(
  '/ai/generation-runs/:runId',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { runId } = req.params;

    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const [taskCount, artifactCount] = await Promise.all([
      prisma.generationTask.count({ where: { runId } }),
      prisma.generatedArtifact.count({ where: { runId } }),
    ]);

    res.json({ ...run, taskCount, artifactCount });
  }),
);

// POST /api/projects/:projectId/ai/generation-runs/:runId/pause
generationRoutes.post(
  '/ai/generation-runs/:runId/pause',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { runId } = req.params;

    const result = await transitionRunStatus(runId, authReq.userId!, 'paused');
    if (!result) {
      res.status(409).json({ error: 'Cannot pause this run' });
      return;
    }

    res.json(result);
  }),
);

// POST /api/projects/:projectId/ai/generation-runs/:runId/resume
generationRoutes.post(
  '/ai/generation-runs/:runId/resume',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { runId } = req.params;

    // Resume needs to know which stage to return to
    const run = await getRun(runId, authReq.userId!);
    if (!run || run.status !== 'paused') {
      res.status(409).json({ error: 'Run is not paused' });
      return;
    }

    // Return to the stage that was current before pause
    const resumeStage = (run.currentStage ?? 'planning') as Parameters<typeof transitionRunStatus>[2];
    const result = await transitionRunStatus(runId, authReq.userId!, resumeStage);
    if (!result) {
      res.status(409).json({ error: 'Cannot resume this run' });
      return;
    }

    res.json(result);
  }),
);

// POST /api/projects/:projectId/ai/generation-runs/:runId/cancel
generationRoutes.post(
  '/ai/generation-runs/:runId/cancel',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { runId } = req.params;

    const result = await transitionRunStatus(runId, authReq.userId!, 'cancelled');
    if (!result) {
      res.status(409).json({ error: 'Cannot cancel this run' });
      return;
    }

    res.json(result);
  }),
);

// GET /api/projects/:projectId/ai/generation-runs/:runId/tasks
generationRoutes.get(
  '/ai/generation-runs/:runId/tasks',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { runId } = req.params;

    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const tasks = await listTasksForRun(runId);
    res.json(tasks);
  }),
);

// GET /api/projects/:projectId/ai/generation-runs/:runId/artifacts
generationRoutes.get(
  '/ai/generation-runs/:runId/artifacts',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { runId } = req.params;

    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    const artifacts = await prisma.generatedArtifact.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });

    res.json(artifacts);
  }),
);

export default generationRoutes;
```

**Step 2: Mount routes in server/src/index.ts**

Add this import at the top of `server/src/index.ts` (after line 12, the ai imports):

```typescript
import generationRoutes from './routes/generation.js';
```

Add this line after line 86 (after `app.use('/api/projects/:projectId', aiWizardRoutes);`):

```typescript
app.use('/api/projects/:projectId', generationRoutes);
```

**Step 3: Run the route tests**

Run: `cd server && npx vitest run src/__tests__/generation/routes.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add server/src/routes/generation.ts server/src/index.ts
git commit -m "feat: add generation run API routes with CRUD and lifecycle endpoints"
```

---

## Task 18: Write failing tests for Redis pub/sub progress service

**Files:**
- Create: `server/src/__tests__/generation/pubsub.test.ts`

**Step 1: Write the test file**

```typescript
// server/src/__tests__/generation/pubsub.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import IORedis from 'ioredis';

// Will be created in Task 19
import {
  publishGenerationEvent,
  subscribeToRun,
  GENERATION_CHANNEL_PREFIX,
} from '../../services/generation/pubsub.service.js';

const redis = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
});

afterAll(async () => {
  await redis.quit();
});

describe('Generation PubSub Service', () => {
  it('should publish and receive a run_status event', async () => {
    const runId = 'test-pubsub-run-1';
    const received: unknown[] = [];

    const { unsubscribe, subscriber } = await subscribeToRun(runId, (event) => {
      received.push(event);
    });

    // Small delay to ensure subscription is active
    await new Promise((r) => setTimeout(r, 100));

    await publishGenerationEvent(runId, {
      type: 'run_status',
      runId,
      status: 'planning',
      stage: 'planning',
      progressPercent: 10,
    });

    // Wait for message delivery
    await new Promise((r) => setTimeout(r, 200));

    expect(received.length).toBe(1);
    expect((received[0] as { type: string }).type).toBe('run_status');

    await unsubscribe();
  });

  it('should use correct channel name', () => {
    expect(GENERATION_CHANNEL_PREFIX).toBe('gen:run:');
  });
});
```

**Step 2: Run the test to verify it fails**

Run: `cd server && npx vitest run src/__tests__/generation/pubsub.test.ts`
Expected: FAIL — cannot resolve module

**Step 3: Commit**

```bash
git add server/src/__tests__/generation/pubsub.test.ts
git commit -m "test: add failing tests for generation pub/sub service"
```

---

## Task 19: Implement pub/sub service for generation events

**Files:**
- Create: `server/src/services/generation/pubsub.service.ts`

**Step 1: Implement the service**

```typescript
// server/src/services/generation/pubsub.service.ts
import IORedis from 'ioredis';
import type { GenerationEvent } from '@dnd-booker/shared';

export const GENERATION_CHANNEL_PREFIX = 'gen:run:';

function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * Publishes a generation event to the Redis channel for a run.
 * Uses the main server redis connection for publishing.
 */
export async function publishGenerationEvent(runId: string, event: GenerationEvent) {
  const { redis } = await import('../../config/redis.js');
  const channel = `${GENERATION_CHANNEL_PREFIX}${runId}`;
  await redis.publish(channel, JSON.stringify(event));
}

/**
 * Subscribes to generation events for a specific run.
 * Creates a dedicated subscriber connection (Redis requires separate connections for pub/sub).
 * Returns an unsubscribe function and the subscriber instance.
 */
export async function subscribeToRun(
  runId: string,
  onEvent: (event: GenerationEvent) => void,
) {
  const subscriber = new IORedis(getRedisConfig());
  const channel = `${GENERATION_CHANNEL_PREFIX}${runId}`;

  subscriber.on('message', (_ch: string, message: string) => {
    try {
      const event = JSON.parse(message) as GenerationEvent;
      onEvent(event);
    } catch {
      // Ignore malformed messages
    }
  });

  await subscriber.subscribe(channel);

  return {
    subscriber,
    unsubscribe: async () => {
      await subscriber.unsubscribe(channel);
      await subscriber.quit();
    },
  };
}
```

**Step 2: Run the tests**

Run: `cd server && npx vitest run src/__tests__/generation/pubsub.test.ts`
Expected: ALL PASS

**Step 3: Commit**

```bash
git add server/src/services/generation/pubsub.service.ts
git commit -m "feat: implement Redis pub/sub service for generation progress events"
```

---

## Task 20: Add SSE streaming endpoint for generation progress

**Files:**
- Modify: `server/src/routes/generation.ts`

**Step 1: Add the SSE endpoint**

Add this route to `server/src/routes/generation.ts` (before the `export default`):

```typescript
import { subscribeToRun } from '../services/generation/pubsub.service.js';

// GET /api/projects/:projectId/ai/generation-runs/:runId/stream — SSE progress
generationRoutes.get(
  '/ai/generation-runs/:runId/stream',
  requireAuth,
  validateUuid('projectId', 'runId'),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthRequest;
    const { runId } = req.params;

    const run = await getRun(runId, authReq.userId!);
    if (!run) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial state
    res.write(`data: ${JSON.stringify({ type: 'run_status', runId, status: run.status, stage: run.currentStage, progressPercent: run.progressPercent })}\n\n`);

    const { unsubscribe } = await subscribeToRun(runId, (event) => {
      try {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        // Client disconnected
      }
    });

    // Clean up on client disconnect
    req.on('close', async () => {
      await unsubscribe();
      res.end();
    });
  }),
);
```

**Step 2: Add the import at the top of the routes file**

The import for `subscribeToRun` should be added at the import section of `generation.ts`.

**Step 3: Verify server typechecks**

Run: `cd server && npx tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add server/src/routes/generation.ts
git commit -m "feat: add SSE streaming endpoint for generation run progress"
```

---

## Task 21: Run all generation tests together and verify everything passes

**Files:** No new files — validation only.

**Step 1: Run all generation tests**

Run: `cd server && npx vitest run src/__tests__/generation/`
Expected: ALL PASS across all 3 test files (run.test.ts, task.test.ts, routes.test.ts, pubsub.test.ts)

**Step 2: Run full server test suite to check for regressions**

Run: `cd server && npx vitest run`
Expected: ALL PASS — no regressions in existing tests

**Step 3: Verify full typecheck**

Run: `cd server && npx tsc --noEmit && npm run typecheck --workspace=shared`
Expected: PASS on both

**Step 4: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: resolve any test or typecheck issues from phase 1-3 integration"
```

---

## Summary

| Task | What | Files |
|------|------|-------|
| 1 | GenerationRun types | `shared/src/types/generation-run.ts` |
| 2 | GenerationTask types | `shared/src/types/generation-task.ts` |
| 3 | Artifact, eval, canon, bible, assembly, doc types | 6 files in `shared/src/types/` |
| 4 | SSE event types | `shared/src/types/generation-events.ts` |
| 5 | Export from shared index | `shared/src/index.ts` |
| 6 | Prisma enums | `server/prisma/schema.prisma` |
| 7 | Prisma: GenerationRun + GenerationTask | `server/prisma/schema.prisma` |
| 8 | Prisma: CampaignBible + Canon | `server/prisma/schema.prisma` |
| 9 | Prisma: Artifact + Evaluation + Revision | `server/prisma/schema.prisma` |
| 10 | Prisma: AssemblyManifest + ProjectDocument | `server/prisma/schema.prisma` |
| 11 | Run migration + generate client | migration file |
| 12 | Failing tests: run service | `server/src/__tests__/generation/run.test.ts` |
| 13 | Implement run service | `server/src/services/generation/run.service.ts` |
| 14 | Failing tests: task service | `server/src/__tests__/generation/task.test.ts` |
| 15 | Implement task service | `server/src/services/generation/task.service.ts` |
| 16 | Failing tests: routes | `server/src/__tests__/generation/routes.test.ts` |
| 17 | Implement routes + mount | `server/src/routes/generation.ts`, `server/src/index.ts` |
| 18 | Failing tests: pub/sub | `server/src/__tests__/generation/pubsub.test.ts` |
| 19 | Implement pub/sub | `server/src/services/generation/pubsub.service.ts` |
| 20 | SSE streaming endpoint | `server/src/routes/generation.ts` |
| 21 | Full integration validation | — |
