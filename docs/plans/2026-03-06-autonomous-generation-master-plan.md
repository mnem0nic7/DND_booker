# Autonomous Campaign Generation — Master Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable DND Booker to generate complete, publication-ready D&D material from a single user prompt — from 5-page one-shots to 200+ page sourcebooks — with no required follow-up input, configurable quality modes, and a durable background pipeline.

**Architecture:** Server-driven phased pipeline executed via BullMQ background jobs with DAG-based task orchestration. Generation produces versioned artifacts staged in a canonical data model before assembly into per-chapter `ProjectDocument` records. A campaign bible and normalized entity graph maintain continuity. An optional multi-dimensional evaluation and repair loop enforces quality. The editor migrates from one monolithic TipTap instance to per-chapter editing.

**Tech Stack:** Express 5, Prisma 6, BullMQ, Vercel AI SDK (`streamText`/`generateText`), Zod, React 19, Zustand 5, Redis pub/sub, existing ToolRegistry

**Consolidates:**
- `docs/plans/claude/2026-03-06-autonomous-campaign-generation.md`
- `docs/plans/codex/2026-03-06-autonomous-campaign-generation-full-plan.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-*.md` (7 files)

---

## Design Decisions

| Decision | Choice | Source |
|---|---|---|
| Editor model | Per-chapter `ProjectDocument` records, not monolithic `Project.content` | Codex |
| Artifact versioning | Full — immutable versions, revision history preserved | VSCode |
| Task execution | DAG with declared dependencies, parallel where possible | VSCode |
| Cost tracking | Track per-task tokens and cost, no enforcement | Codex (modified) |
| Evaluation | 5-dimension weighted scoring with per-artifact-type thresholds | VSCode |
| Provider policy | Warn but allow Ollama for autonomous runs | Codex (modified) |
| Quality regression | Golden prompt suite maintained across releases | Codex |
| Continuity model | Canonical entity graph with stable IDs, not prompt-based memory | Codex + VSCode |
| Background execution | BullMQ workers, DB-persisted state, survives disconnects | All three |
| Project.content | Remains as compiled cache during migration; ProjectDocument[] is canonical | Codex |

---

## Product Definition

### Supported Generation Modes

| Mode | Target Pages | Chapters | NPCs | Locations | Appendices |
|---|---|---|---|---|---|
| One-shot | 8–18 | 2–5 scenes | 2–6 | 2–4 | Optional |
| Adventure module | 24–60 | 4–8 | 4–10 | 4–8 | 1–2 |
| Campaign book | 80–200 | 8–15 | 8–20 | 8–20 | 2–4 |
| Sourcebook | 80–250 | 10–20 | varies | varies | 3–6 |

### Product Principles

1. **No mandatory follow-up questions.** The initial brief is sufficient. Optional refinement exists but is never required.
2. **Structured planning before prose.** Canon and planning artifacts exist before chapter text is written.
3. **Canon over drift.** Entity continuity is governed by canonical structured data, not prompt memory.
4. **Artifacts are first-class.** Generated output is staged, versioned, and evaluated before assembly.
5. **Quality is enforced, not assumed.** Evaluation loops catch problems before finalization.
6. **Runs survive disconnects.** Long generations run as background jobs with DB-persisted state.
7. **The editor remains usable.** Autonomous generation does not degrade manual authoring.
8. **Autonomous does not mean opaque.** Users can inspect progress, review artifacts, and intervene.

### Non-Goals for V1

- Fully automatic tactical maps with guaranteed battle-ready geometry
- Perfect encounter balance without any review pass
- Non-5e systems
- Collaborative multi-user editing of an active generation run
- Guaranteed sub-minute generation for 150+ page outputs
- Zero-cost generation at arbitrary page counts

---

## Gap Analysis Summary

| # | Gap | Current State | Required State |
|---|---|---|---|
| 1 | Flat outline | 4–8 sections max | Hierarchical: book → chapters → sections |
| 2 | No canon model | Working memory + 300-char summaries | Campaign bible + entity graph with stable IDs |
| 3 | No background jobs | Foreground SSE, browser tab required | BullMQ workers, DB-persisted progress |
| 4 | No artifact staging | Sections inserted directly into content | Versioned artifacts → evaluation → assembly |
| 5 | No evaluation loop | Manual one-shot evaluation | Multi-dimensional scoring with revision passes |
| 6 | Monolithic document | Single `Project.content` JSON blob | Per-chapter `ProjectDocument` records |
| 7 | No task DAG | Sequential section generation | DAG-based tasks with parallel execution |
| 8 | No cost tracking | None | Per-task token/cost recording |
| 9 | No page budgets | No target sizing | Page budgets per chapter and mode |
| 10 | No appendix generation | Manual only | Auto-generated from world bible entities |

---

## Domain Model

### New Prisma Models

#### `GenerationRun`

The aggregate root for one autonomous generation attempt.

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

model GenerationRun {
  id              String           @id @default(uuid())
  projectId       String           @map("project_id")
  userId          String           @map("user_id")
  mode            GenerationMode
  quality         GenerationQuality @default(quick)
  status          RunStatus        @default(queued)
  currentStage    String?          @map("current_stage")
  inputPrompt     String           @map("input_prompt")
  inputParameters Json?            @map("input_parameters")
  progressPercent Int              @default(0) @map("progress_percent")
  estimatedPages  Int?             @map("estimated_pages")
  estimatedTokens Int?             @map("estimated_tokens")
  estimatedCost   Float?           @map("estimated_cost")
  actualTokens    Int              @default(0) @map("actual_tokens")
  actualCost      Float            @default(0) @map("actual_cost")
  failureReason   String?          @map("failure_reason")
  metricsJson     Json?            @map("metrics_json")
  createdAt       DateTime         @default(now()) @map("created_at")
  updatedAt       DateTime         @updatedAt @map("updated_at")
  startedAt       DateTime?        @map("started_at")
  completedAt     DateTime?        @map("completed_at")

  project         Project          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user            User             @relation(fields: [userId], references: [id], onDelete: Cascade)
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
```

#### `GenerationTask`

A durable unit of work in the DAG. Tasks declare dependencies and support bounded retries.

```prisma
enum TaskStatus {
  queued
  blocked       // dependencies not yet complete
  running
  completed
  failed
  cancelled
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
  dependsOn       Json        @default("[]") @map("depends_on") // array of task IDs
  inputPayload    Json?       @map("input_payload")
  resultPayload   Json?       @map("result_payload")
  errorMessage    String?     @map("error_message")
  tokenCount      Int?        @map("token_count")
  costEstimate    Float?      @map("cost_estimate")
  startedAt       DateTime?   @map("started_at")
  completedAt     DateTime?   @map("completed_at")
  createdAt       DateTime    @default(now()) @map("created_at")
  updatedAt       DateTime    @updatedAt @map("updated_at")

  run             GenerationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  parentTask      GenerationTask? @relation("TaskParent", fields: [parentTaskId], references: [id])
  childTasks      GenerationTask[] @relation("TaskParent")

  @@index([runId])
  @@index([runId, status])
  @@index([parentTaskId])
  @@map("generation_tasks")
}
```

**Task types:**
- `normalize_input`
- `generate_campaign_bible`
- `generate_chapter_outline`
- `generate_chapter_plan`
- `generate_npc_dossier`
- `generate_location_brief`
- `generate_faction_profile`
- `generate_encounter_bundle`
- `generate_item_bundle`
- `generate_chapter_draft`
- `generate_appendix_draft`
- `generate_front_matter`
- `generate_back_matter`
- `evaluate_artifact`
- `revise_artifact`
- `assemble_documents`
- `run_preflight`

#### `CampaignBible`

Canonical source of truth for setting, tone, structure, and narrative constraints.

```prisma
model CampaignBible {
  id              String    @id @default(uuid())
  runId           String    @unique @map("run_id")
  projectId       String    @map("project_id")
  version         Int       @default(1)
  title           String
  summary         String
  premise         String?
  worldRules      Json?     @map("world_rules")     // setting, era, tone, forbidden
  actStructure    Json?     @map("act_structure")    // act-level story beats
  timeline        Json?                               // key timeline events
  levelProgression Json?    @map("level_progression") // milestone or XP shape
  pageBudget      Json?     @map("page_budget")      // per-chapter page targets
  styleGuide      Json?     @map("style_guide")      // voice, vocabulary rules
  openThreads     Json?     @map("open_threads")     // unresolved plot threads
  status          String    @default("draft")         // draft, accepted
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  run             GenerationRun @relation(fields: [runId], references: [id], onDelete: Cascade)
  project         Project   @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@map("campaign_bibles")
}
```

#### `CanonEntity`

Normalized entities for continuity tracking and retrieval.

```prisma
model CanonEntity {
  id              String    @id @default(uuid())
  projectId       String    @map("project_id")
  runId           String    @map("run_id")
  entityType      String    @map("entity_type") // npc, location, faction, item, quest, monster, encounter
  slug            String
  canonicalName   String    @map("canonical_name")
  aliases         Json      @default("[]")
  canonicalData   Json      @map("canonical_data")  // type-specific structured data
  summary         String                             // searchable plaintext summary
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
  referenceType   String    @map("reference_type") // introduces, mentions, resolves, depends_on
  metadata        Json?

  entity          CanonEntity @relation(fields: [entityId], references: [id], onDelete: Cascade)
  artifact        GeneratedArtifact @relation(fields: [artifactId], references: [id], onDelete: Cascade)

  @@index([entityId])
  @@index([artifactId])
  @@map("canon_references")
}
```

#### `GeneratedArtifact`

Versioned, immutable piece of staged output.

```prisma
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

model GeneratedArtifact {
  id              String         @id @default(uuid())
  runId           String         @map("run_id")
  projectId       String         @map("project_id")
  sourceTaskId    String?        @map("source_task_id")
  artifactType    String         @map("artifact_type")
  artifactKey     String         @map("artifact_key")
  parentArtifactId String?       @map("parent_artifact_id")
  status          ArtifactStatus @default(queued)
  version         Int            @default(1)
  title           String
  summary         String?
  jsonContent     Json?          @map("json_content")
  markdownContent String?        @map("markdown_content")
  tiptapContent   Json?          @map("tiptap_content")
  metadata        Json?
  pageEstimate    Int?           @map("page_estimate")
  tokenCount      Int?           @map("token_count")
  createdAt       DateTime       @default(now()) @map("created_at")
  updatedAt       DateTime       @updatedAt @map("updated_at")

  run             GenerationRun  @relation(fields: [runId], references: [id], onDelete: Cascade)
  project         Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  parentArtifact  GeneratedArtifact? @relation("ArtifactParent", fields: [parentArtifactId], references: [id])
  childArtifacts  GeneratedArtifact[] @relation("ArtifactParent")
  evaluations     ArtifactEvaluation[]
  revisions       ArtifactRevision[] @relation("RevisionTarget")
  canonReferences CanonReference[]

  @@unique([runId, artifactType, artifactKey, version])
  @@index([runId])
  @@index([projectId])
  @@index([artifactType])
  @@index([status])
  @@map("generated_artifacts")
}
```

**Artifact types:**

| Category | Types |
|---|---|
| Planning | `project_profile`, `campaign_bible`, `chapter_outline`, `chapter_plan`, `section_spec`, `appendix_plan` |
| Reference | `npc_dossier`, `location_brief`, `faction_profile`, `quest_arc`, `item_bundle`, `monster_bundle`, `encounter_bundle` |
| Written | `chapter_draft`, `section_draft`, `appendix_draft`, `front_matter_draft`, `back_matter_draft`, `sidebar_bundle`, `read_aloud_bundle`, `handout_bundle` |
| Evaluation | `artifact_evaluation`, `continuity_report`, `preflight_report` |
| Assembly | `assembly_manifest` |

#### `ArtifactEvaluation`

Scoring and findings for one artifact version.

```prisma
model ArtifactEvaluation {
  id                    String   @id @default(uuid())
  artifactId            String   @map("artifact_id")
  artifactVersion       Int      @map("artifact_version")
  evaluationType        String   @map("evaluation_type")
  overallScore          Float    @map("overall_score")     // 0-100
  structuralCompleteness Float?  @map("structural_completeness")
  continuityScore       Float?   @map("continuity_score")
  dndSanity             Float?   @map("dnd_sanity")
  editorialQuality      Float?   @map("editorial_quality")
  publicationFit        Float?   @map("publication_fit")
  passed                Boolean
  findings              Json                                // array of Finding objects
  recommendedActions    Json?    @map("recommended_actions")
  evaluatorModel        String?  @map("evaluator_model")
  tokenCount            Int?     @map("token_count")
  createdAt             DateTime @default(now()) @map("created_at")

  artifact              GeneratedArtifact @relation(fields: [artifactId], references: [id], onDelete: Cascade)

  @@index([artifactId])
  @@map("artifact_evaluations")
}
```

#### `ArtifactRevision`

Records revision history for traceability.

```prisma
model ArtifactRevision {
  id                  String   @id @default(uuid())
  artifactId          String   @map("artifact_id")
  fromVersion         Int      @map("from_version")
  toVersion           Int      @map("to_version")
  reason              String
  findingCodes        Json?    @map("finding_codes")  // which findings triggered this
  revisionPrompt      String?  @map("revision_prompt")
  tokenCount          Int?     @map("token_count")
  createdAt           DateTime @default(now()) @map("created_at")

  artifact            GeneratedArtifact @relation("RevisionTarget", fields: [artifactId], references: [id], onDelete: Cascade)

  @@index([artifactId])
  @@map("artifact_revisions")
}
```

#### `AssemblyManifest`

Ordered plan for turning artifacts into final documents.

```prisma
model AssemblyManifest {
  id              String    @id @default(uuid())
  runId           String    @map("run_id")
  projectId       String    @map("project_id")
  version         Int       @default(1)
  documents       Json                        // ordered array of document specs
  assemblyRules   Json?     @map("assembly_rules")
  status          String    @default("draft") // draft, accepted, assembled
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")

  run             GenerationRun @relation(fields: [runId], references: [id], onDelete: Cascade)

  @@index([runId])
  @@map("assembly_manifests")
}
```

#### `ProjectDocument`

Editor-sized document unit. Replaces monolithic `Project.content` as the canonical editable representation.

```prisma
enum DocumentKind {
  front_matter
  chapter
  appendix
  back_matter
}

model ProjectDocument {
  id              String       @id @default(uuid())
  projectId       String       @map("project_id")
  runId           String?      @map("run_id")     // null for manually created docs
  kind            DocumentKind
  title           String
  slug            String
  sortOrder       Int          @map("sort_order")
  targetPageCount Int?         @map("target_page_count")
  outlineJson     Json?        @map("outline_json")
  content         Json         @default("{}")      // TipTap JSON for this chapter
  status          String       @default("draft")   // draft, generated, edited, final
  sourceArtifactId String?     @map("source_artifact_id")
  createdAt       DateTime     @default(now()) @map("created_at")
  updatedAt       DateTime     @updatedAt @map("updated_at")

  project         Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@unique([projectId, slug])
  @@index([projectId])
  @@index([projectId, sortOrder])
  @@map("project_documents")
}
```

### Model Relationships Added to Existing Models

Add to `Project`:
```prisma
generationRuns  GenerationRun[]
campaignBibles  CampaignBible[]
canonEntities   CanonEntity[]
artifacts       GeneratedArtifact[]
documents       ProjectDocument[]
```

Add to `User`:
```prisma
generationRuns  GenerationRun[]
```

### Compatibility Strategy

- `Project.content` remains during migration as a compiled cache
- `ProjectDocument[]` becomes the canonical editable representation
- Assembly compiles ProjectDocuments into `Project.content` for backward-compatible export
- Once per-document editing is complete, `Project.content` becomes a read-only cache rebuilt on export

---

## Pipeline Stages

```
Stage 0: Intake
  └─ Normalize input, infer mode/budget/constraints, create GenerationRun

Stage 1: Planning
  ├─ Generate campaign bible
  ├─ Generate chapter outline + page budgets
  ├─ Generate chapter plans + section specs
  └─ Generate appendix plan

Stage 2: Reference Asset Generation
  ├─ Generate NPC dossiers (parallel)
  ├─ Generate location briefs (parallel)
  ├─ Generate faction profiles (parallel)
  ├─ Generate encounter bundles (parallel)
  └─ Generate item/monster bundles (parallel)

Stage 3: Prose Generation
  ├─ Generate chapter drafts (sequential by dependency, sections parallel within chapter)
  ├─ Generate front matter
  └─ Generate appendix drafts (parallel, after relevant entities exist)

Stage 4: Evaluation (polished mode only)
  ├─ Evaluate each artifact against 5-dimension rubric
  ├─ Generate continuity report
  └─ Generate completeness report

Stage 5: Revision (polished mode only)
  ├─ Revise failing artifacts (up to 2 passes)
  ├─ Re-evaluate revised artifacts
  └─ Escalate if still failing

Stage 6: Assembly
  ├─ Generate assembly manifest
  ├─ Assemble ProjectDocuments from accepted artifacts
  ├─ Compile Project.content cache
  └─ Run preflight validation

Stage 7: Complete
  └─ Mark run completed, publish progress event
```

### DAG Dependency Rules

- No chapter writing begins until campaign bible and entity graph are accepted
- Chapter plan generation must complete before its prose generation
- Appendices depend on the existence of their source entities
- Front/back matter can generate in parallel with chapters
- Evaluation depends on all artifacts for the current scope being generated
- Assembly depends on all required artifacts being accepted
- Preflight depends on assembly

### Quick Mode vs Polished Mode

| Aspect | Quick | Polished |
|---|---|---|
| Stages | 0 → 1 → 2 → 3 → 6 → 7 | 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 |
| Evaluation | Skipped | Multi-dimensional scoring |
| Revision | None | Up to 2 passes per artifact |
| Estimated time multiplier | 1x | 1.5–2x |

---

## Evaluation Framework

### Dimensions (scored 0–100)

| Dimension | Weight (written) | Weight (planning) | Weight (reference) | Description |
|---|---|---|---|---|
| Structural completeness | 0.20 | 0.30 | 0.25 | All required components present |
| Continuity | 0.25 | 0.30 | 0.30 | Aligns with bible and established canon |
| D&D sanity | 0.20 | 0.10 | 0.20 | Mechanically plausible for 5e |
| Editorial quality | 0.20 | 0.15 | 0.10 | Readable, well-paced, useful |
| Publication fit | 0.15 | 0.15 | 0.15 | Correct size, export-ready structure |

**Overall = weighted sum of dimensions.**

### Acceptance Thresholds

| Artifact Class | Overall | Continuity | Structural |
|---|---|---|---|
| Planning | ≥ 85 | ≥ 90 | ≥ 90 |
| Reference | ≥ 80 | ≥ 85 | ≥ 80 |
| Written | ≥ 78 | ≥ 80 | ≥ 80 |
| Assembly/Preflight | ≥ 90 | — | ≥ 95 |

### Finding Severities

| Severity | Action | Example |
|---|---|---|
| Critical | Block assembly, mandatory revision | Canon contradiction breaking plot |
| Major | Create revision task | Location inconsistency, CR mismatch |
| Minor | Optional revision | Repetitive phrasing, weak transitions |
| Informational | No action | Optimization suggestions |

### Revision Policy

- Planning artifacts: up to 2 revision passes
- Reference artifacts: up to 2 revision passes
- Written artifacts: up to 2 revision passes
- Escalate to user review if same major issue persists after 2 revisions

---

## API Endpoints

### Run Lifecycle

```
POST   /api/projects/:projectId/ai/generation-runs              — Start run
GET    /api/projects/:projectId/ai/generation-runs              — List runs
GET    /api/projects/:projectId/ai/generation-runs/:runId       — Run detail + summary
GET    /api/projects/:projectId/ai/generation-runs/:runId/stream — SSE progress
POST   /api/projects/:projectId/ai/generation-runs/:runId/pause  — Pause run
POST   /api/projects/:projectId/ai/generation-runs/:runId/resume — Resume run
POST   /api/projects/:projectId/ai/generation-runs/:runId/cancel — Cancel run
```

### Tasks & Artifacts

```
GET    /api/projects/:projectId/ai/generation-runs/:runId/tasks      — Task list/tree
GET    /api/projects/:projectId/ai/generation-runs/:runId/artifacts   — Artifact list
GET    /api/projects/:projectId/ai/generation-runs/:runId/artifacts/:id — Artifact detail
POST   /api/projects/:projectId/ai/generation-runs/:runId/regenerate-artifact — Targeted regen
```

### Canon & Evaluation

```
GET    /api/projects/:projectId/ai/generation-runs/:runId/canon       — Canon entity list
GET    /api/projects/:projectId/ai/generation-runs/:runId/evaluations — Evaluation reports
```

### Assembly

```
POST   /api/projects/:projectId/ai/generation-runs/:runId/assemble   — Assemble documents
```

### Per-Chapter Document Editing

```
GET    /api/projects/:projectId/documents                — List project documents
GET    /api/projects/:projectId/documents/:docId         — Get one document
PUT    /api/projects/:projectId/documents/:docId/content — Update document content
POST   /api/projects/:projectId/documents/reorder        — Reorder documents
```

### Create Run Request

```json
{
  "prompt": "Create a 120-page gothic horror campaign for levels 3-10...",
  "mode": "campaign",
  "quality": "polished",
  "pageTarget": 120,
  "constraints": {
    "tone": "gothic horror",
    "levelRange": "3-10",
    "includeHandouts": true,
    "strict5e": true
  }
}
```

### SSE Event Types

```
run_status        — phase/progress changes
task_started      — task begins execution
task_completed    — task finished
artifact_created  — new artifact version
artifact_evaluated — evaluation result
run_warning       — budget overrun, escalation
run_completed     — all done
run_failed        — terminal failure
```

---

## Client UX

### New Components

| Component | Purpose |
|---|---|
| `AutonomousGenerationDialog` | Prompt input, mode selector, quality toggle, constraints |
| `GenerationRunPanel` | Phase progress, task counts, artifact counts, warnings |
| `ArtifactReviewPanel` | Browse/filter/inspect artifacts, accept/reject/regenerate |
| `CanonBrowser` | Visual campaign bible: NPCs, locations, factions, items |
| `AssemblyReviewPanel` | Document order, page estimates, preflight, assemble button |
| `DocumentNavigator` | Per-chapter sidebar: front matter, chapters, appendices, back matter |

### User Flows

1. **Start run** — Dialog → prompt → optional settings → submit → background job starts
2. **Monitor progress** — Run panel shows live phase, progress %, chapter completion
3. **Review artifacts** — Browse generated chapters, NPCs, evaluations, accept/reject/regen
4. **Inspect canon** — Campaign bible overview, entity roster, cross-references
5. **Handle failures** — Severity-tagged findings, suggested actions, targeted regeneration
6. **Assemble output** — Review document order, run preflight, assemble into project
7. **Edit chapters** — Per-document editor loads one chapter at a time

### Editor Migration

The current monolithic editor (`EditorLayout.tsx` + `projectStore.ts`) loads the entire `Project.content` JSON into one TipTap instance.

Target:
- `DocumentNavigator` sidebar groups documents by kind (front matter → chapters → appendices → back matter)
- Clicking a document loads only that chapter's content into TipTap
- Autosave operates per-document via `PUT /api/projects/:id/documents/:docId/content`
- Full-book preview/export compiles from ordered `ProjectDocument[]`

### Store Changes

New Zustand store `generationStore.ts`:
- `activeRun: GenerationRunSummary | null`
- `artifacts: GeneratedArtifact[]`
- `canonEntities: CanonEntity[]`
- `evaluations: ArtifactEvaluation[]`
- `startRun()`, `pauseRun()`, `resumeRun()`, `cancelRun()`
- `pollProgress()`, `streamProgress()`
- `regenerateArtifact()`, `assembleDocuments()`

Modify `projectStore.ts`:
- `documents: ProjectDocument[]`
- `activeDocument: ProjectDocument | null`
- `loadDocument()`, `saveDocument()`, `reorderDocuments()`

---

## Orchestration Design

### BullMQ Queues

| Queue | Concurrency | Purpose |
|---|---|---|
| `generation:orchestrator` | 1 | Top-level run scheduler, phase transitions |
| `generation:planner` | 2 | Bible, outlines, chapter plans |
| `generation:artifacts` | 3 | NPCs, locations, items, chapter drafts |
| `generation:evaluate` | 2 | Artifact evaluation, continuity checks |
| `generation:revise` | 2 | Revision passes |
| `generation:assemble` | 1 | Document assembly, preflight |

### Task Dispatch

The orchestrator job:
1. Loads the run and its task graph
2. Finds all tasks whose dependencies are `completed`
3. Enqueues them on the appropriate queue
4. Waits for completion notifications (Redis pub/sub)
5. Repeats until all tasks are done or the run fails/cancels

### Idempotency

Each task is keyed by `(runId, taskType, artifactKey, inputHash)`. Retries check whether output already exists before regenerating.

### Checkpoints

Persist state after: campaign bible, each chapter plan, each reference artifact batch, each chapter draft, each evaluation wave, assembly.

### Progress Publishing

Worker publishes `GenerationEvent` to Redis channel `gen:run:{runId}`. The SSE endpoint subscribes and forwards to client. Also writes to `GenerationRun.progressPercent` and `currentStage` for polling.

---

## Provider Policy

| Provider | Chat/Block Gen | Autonomous Generation |
|---|---|---|
| Anthropic | Full support | Full support |
| OpenAI | Full support | Full support |
| Ollama | Full support | Warn: "Local models may produce lower quality results for large generation runs. Continue?" |

---

## Cost Tracking

Track per-task:
- `tokenCount` (input + output)
- `costEstimate` (calculated from model pricing)

Aggregate on run:
- `actualTokens` — sum of all task tokens
- `actualCost` — sum of all task costs
- `estimatedTokens` / `estimatedCost` — calculated from outline + mode profile

No enforcement — users own their API keys. Cost is displayed in the run panel for transparency.

---

## Implementation Phases

### Phase 1: Shared Types + Prisma Schema

**Goal:** Establish the generation domain in code.

**Files:**
- Create: `shared/src/types/generation-run.ts`
- Create: `shared/src/types/campaign-bible.ts`
- Create: `shared/src/types/generated-artifact.ts`
- Create: `shared/src/types/artifact-evaluation.ts`
- Create: `shared/src/types/canon-entity.ts`
- Create: `shared/src/types/assembly-manifest.ts`
- Create: `shared/src/types/project-document.ts`
- Modify: `shared/src/index.ts`
- Modify: `server/prisma/schema.prisma`

**Validation:** Migration succeeds, typecheck passes.

### Phase 2: Run + Task Services

**Goal:** CRUD for runs, tasks, and the DAG executor.

**Files:**
- Create: `server/src/services/generation/run.service.ts`
- Create: `server/src/services/generation/task.service.ts`
- Create: `server/src/services/generation/dag-executor.service.ts`
- Test: `server/src/__tests__/generation/run.test.ts`
- Test: `server/src/__tests__/generation/task.test.ts`
- Test: `server/src/__tests__/generation/dag-executor.test.ts`

**Validation:** Can create runs, add tasks with dependencies, execute ready tasks, handle retries.

### Phase 3: Run API + SSE Streaming

**Goal:** Expose run lifecycle to the client.

**Files:**
- Create: `server/src/routes/generation.ts`
- Create: `server/src/services/generation/pubsub.service.ts`
- Modify: `server/src/index.ts`
- Test: `server/src/__tests__/generation/routes.test.ts`

**Validation:** Authenticated CRUD, SSE streaming, pause/resume/cancel.

### Phase 4: Intake + Campaign Bible

**Goal:** Turn a prompt into a structured generation plan.

**Files:**
- Create: `server/src/services/generation/intake.service.ts`
- Create: `server/src/services/generation/bible.service.ts`
- Create: `server/src/services/generation/prompts/normalize-input.prompt.ts`
- Create: `server/src/services/generation/prompts/campaign-bible.prompt.ts`
- Test: `server/src/__tests__/generation/intake.test.ts`
- Test: `server/src/__tests__/generation/bible.test.ts`

**Validation:** One prompt → structured bible with entities, tone rules, page budgets.

### Phase 5: Decomposition + Planning Artifacts

**Goal:** Turn the bible into chapter plans and section specs.

**Files:**
- Create: `server/src/services/generation/outline.service.ts`
- Create: `server/src/services/generation/chapter-plan.service.ts`
- Create: `server/src/services/generation/prompts/chapter-outline.prompt.ts`
- Create: `server/src/services/generation/prompts/chapter-plan.prompt.ts`
- Test: `server/src/__tests__/generation/outline.test.ts`

**Validation:** One-shot yields 3–5 chapter plans; campaign yields 8–15 with budgets.

### Phase 6: Canon Entities + Reference Artifacts

**Goal:** Generate reusable assets before prose.

**Files:**
- Create: `server/src/services/generation/canon.service.ts`
- Create: `server/src/services/generation/prompts/npc-dossier.prompt.ts`
- Create: `server/src/services/generation/prompts/location-brief.prompt.ts`
- Create: `server/src/services/generation/prompts/faction-profile.prompt.ts`
- Create: `server/src/services/generation/prompts/encounter-bundle.prompt.ts`
- Create: `server/src/services/generation/prompts/item-bundle.prompt.ts`
- Test: `server/src/__tests__/generation/canon.test.ts`

**Validation:** Entities are versioned, searchable, cross-referenced.

### Phase 7: Chapter Draft Generation

**Goal:** Generate prose with full canon context.

**Files:**
- Create: `server/src/services/generation/chapter-writer.service.ts`
- Create: `server/src/services/generation/context-assembler.service.ts`
- Create: `server/src/services/generation/prompts/chapter-draft.prompt.ts`
- Reuse: `server/src/services/ai-wizard.service.ts` (`markdownToTipTap`)
- Test: `server/src/__tests__/generation/chapter-writer.test.ts`

**Validation:** Chapters reference canon entities, maintain continuity via bible context.

### Phase 8: Evaluation + Revision Loop

**Goal:** Multi-dimensional scoring with bounded repair.

**Files:**
- Create: `server/src/services/generation/evaluator.service.ts`
- Create: `server/src/services/generation/reviser.service.ts`
- Create: `server/src/services/generation/prompts/evaluate-artifact.prompt.ts`
- Create: `server/src/services/generation/prompts/revise-artifact.prompt.ts`
- Test: `server/src/__tests__/generation/evaluator.test.ts`
- Test: `server/src/__tests__/generation/reviser.test.ts`

**Validation:** Failing artifacts get findings, revisions capped at 2, escalation works.

### Phase 9: Assembly + Preflight

**Goal:** Turn accepted artifacts into ProjectDocuments.

**Files:**
- Create: `server/src/services/generation/assembler.service.ts`
- Create: `server/src/services/generation/preflight.service.ts`
- Test: `server/src/__tests__/generation/assembler.test.ts`

**Validation:** Correct document order, page budgets respected, preflight catches issues.

### Phase 10: BullMQ Worker Integration

**Goal:** Wire everything into background job execution.

**Files:**
- Create: `worker/src/jobs/generation-orchestrator.job.ts`
- Create: `worker/src/jobs/generation-task.job.ts`
- Modify: `worker/src/index.ts` (register queues)
- Create: `server/src/services/generation/queue.service.ts`

**Validation:** Browser disconnect doesn't stop run, worker restart resumes.

### Phase 11: Chat Integration (AI Tool)

**Goal:** AI can trigger autonomous generation from chat.

**Files:**
- Create: `server/src/services/ai-tools/content/start-generation-run.ts`
- Modify: `server/src/services/ai-tools/register-all.ts`
- Modify: `server/src/services/ai-content.service.ts` (system prompt)
- Test: `server/src/__tests__/ai-tools/start-generation-run.test.ts`

**Validation:** AI detects "create a full campaign" intent, calls tool, background job starts.

### Phase 12: Client — Run Progress UI

**Goal:** Users can start, monitor, and control runs.

**Files:**
- Create: `client/src/stores/generationStore.ts`
- Create: `client/src/components/ai/AutonomousGenerationDialog.tsx`
- Create: `client/src/components/ai/GenerationRunPanel.tsx`

**Validation:** Start from prompt, see live progress, pause/cancel.

### Phase 13: Client — Artifact Review + Canon Browser

**Goal:** Users can inspect generated artifacts and canon.

**Files:**
- Create: `client/src/components/ai/ArtifactReviewPanel.tsx`
- Create: `client/src/components/ai/CanonBrowser.tsx`
- Create: `client/src/components/ai/AssemblyReviewPanel.tsx`

**Validation:** Browse artifacts, view evaluations, accept/reject/regenerate, inspect canon.

### Phase 14: Editor Migration — Per-Document Editing

**Goal:** Break monolithic editor into per-chapter editing.

**Files:**
- Create: `server/src/routes/documents.ts`
- Create: `server/src/services/document.service.ts`
- Create: `client/src/components/editor/DocumentNavigator.tsx`
- Modify: `client/src/components/editor/EditorLayout.tsx`
- Modify: `client/src/stores/projectStore.ts`
- Test: `server/src/__tests__/documents.test.ts`

**Validation:** Can load/save individual chapters, navigate between documents, full-book export still works.

### Phase 15: Export Adaptation

**Goal:** Export pipeline reads from `ProjectDocument[]` instead of monolithic content.

**Files:**
- Modify: `worker/src/jobs/export.job.ts`
- Modify: `server/src/services/export.service.ts`

**Validation:** PDF/EPUB export produces correct document order from ProjectDocuments.

### Phase 16: Golden Prompt Regression Suite

**Goal:** Quality regression testing across releases.

**Files:**
- Create: `server/src/__tests__/generation/golden-prompts.test.ts`
- Create: `server/src/__tests__/generation/golden-prompts/` (prompt fixtures)

**Prompts:**
1. Generic fantasy one-shot: "A level 4 goblin cave adventure for new players"
2. Horror mini-campaign: "A 3-session horror campaign in a decaying swamp kingdom"
3. Urban intrigue campaign: "A level 1-10 campaign of political intrigue in a floating city"
4. Wilderness hex campaign: "An exploration-focused campaign in an uncharted jungle continent"

**Measure:** Continuity quality, completeness, evaluator findings count, repair counts, cost.

### Phase 17: E2E Tests

**Goal:** Full pipeline validation.

**Files:**
- Create: `server/src/__tests__/generation/e2e.test.ts`
- Create: `client/e2e/ai-autonomous-generation.spec.ts`

**Tests:**
- Prompt → one-shot → complete run
- Prompt → campaign → complete run (polished)
- Run fails one chapter, recovers via retry
- User pauses and resumes a run
- User regenerates a single artifact
- Export generated project to PDF
- Ollama provider shows warning dialog

---

## Phase Dependencies

```
Phase 1 (Types + Schema)
  ↓
Phase 2 (Run + Task Services)
  ↓
Phase 3 (API + SSE) ←──────────────── Phase 12 (Client Run UI)
  ↓                                        ↓
Phase 4 (Intake + Bible)              Phase 13 (Artifact Review + Canon)
  ↓
Phase 5 (Decomposition)
  ↓
Phase 6 (Canon Entities)  ──parallel──  Phase 7 (Chapter Writing)
  ↓                                        ↓
Phase 8 (Evaluation + Revision)
  ↓
Phase 9 (Assembly + Preflight)
  ↓
Phase 10 (BullMQ Worker) ←── Phase 11 (Chat Integration)
  ↓
Phase 14 (Editor Migration) ──parallel── Phase 15 (Export Adaptation)
  ↓
Phase 16 (Golden Prompts) ── Phase 17 (E2E Tests)
```

**Recommended vertical slice:** Phases 1–10 for one-shot mode first. Prove the architecture end-to-end before building client UI (12–13), editor migration (14), and full campaigns.

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Cost explosion on large runs | Page budgets, cost tracking (displayed to user), bounded retry limits |
| Continuity drift across chapters | Canonical entity graph, structured retrieval, evaluator gates |
| Editor performance with large docs | Per-document editing (ProjectDocument), lazy loading |
| Export mismatch | Compile from ordered ProjectDocument[], same structure for both |
| Provider inconsistency | Provider warnings for Ollama, quality benchmarks via golden prompts |
| Over-engineering the first release | Vertical slice strategy: one-shot first, campaign later |
| Worker reliability | BullMQ durability, checkpointing, idempotent tasks, bounded retries |
| Evaluation score gaming | Multiple dimensions prevent one-trick optimization, findings-based not just score-based |
