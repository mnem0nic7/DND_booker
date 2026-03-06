# Autonomous Campaign Generation Detailed Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Purpose:** This is the detailed execution plan for turning DND Booker into a system that can generate complete D&D products from a short brief with little or no further user input. It is a planning document only. It does not assume any implementation has started.

**Companion Doc:** `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-plan.md`

**Primary Outcome:** A user can enter a compact prompt such as “Create a 120-page horror campaign for levels 3-10 set in a decaying swamp kingdom,” and the system can autonomously plan, generate, evaluate, revise, and assemble a coherent, publication-ready project.

**Non-Goals For The First Major Release:**
- fully automatic cartography with guaranteed tactical correctness
- guaranteed rules-perfect encounter math with no review pass
- multi-system support outside D&D 5e
- collaborative multi-user authoring of a single active generation run
- zero-cost generation at arbitrary page counts

---

## Product Definition

## Supported Generation Modes

The system should explicitly support these modes rather than treating them as variations of one generic wizard.

### Mode 1: Prompt-To-One-Shot

**Target:** 8 to 16 pages.

**Input Example:**
"A level 4 desert one-shot about a buried observatory and a star cult."

**Expected Output:**
- title page
- summary and DM overview
- 2 to 4 adventure chapters or scenes
- 2 to 6 encounters
- 2 to 6 reusable stat blocks or NPC profiles
- treasure and reward section
- optional handout or map brief

### Mode 2: Prompt-To-Adventure Module

**Target:** 24 to 48 pages.

**Expected Output:**
- title page and credits
- DM overview and campaign hook
- 4 to 8 chapters
- recurring NPCs and location briefs
- appendix with monsters, items, tables, and handouts

### Mode 3: Prompt-To-Campaign Book

**Target:** 80 to 160 pages in initial production release, with an extension path to 200+ pages.

**Expected Output:**
- campaign bible
- act structure
- chapter progression across levels or milestones
- multiple recurring factions, NPC arcs, and locations
- appendices and reference material
- staged delivery and resumable generation

### Mode 4: Prompt-To-Sourcebook Style Product

**Target:** 80 to 200+ pages.

**Expected Output:**
- lore chapters
- optional player-facing or DM-facing mechanics
- class features, race options, items, tables, setting sections, and appendices

---

## Core Product Principles

1. **Autonomous does not mean opaque.** The user can inspect progress, review artifacts, and intervene when needed.
2. **Generate in layers, not in one pass.** The system should plan first, then generate assets, then prose, then evaluate, then assemble.
3. **Canon beats prose.** Long-form consistency should be anchored in structured data before chapter text is written.
4. **Artifacts are first-class.** Generated output should be staged and versioned before assembly into final documents.
5. **Quality is enforced through evaluation loops.** The system should not assume the first draft is acceptable.
6. **Runs must survive disconnects.** Long generation cannot depend on a live browser request.

---

## Current Constraints In The Existing Codebase

The existing project already has useful AI primitives, but several current behaviors constrain scale.

### Existing Strengths

- AI chat, planning state, and project-context prompts exist in `server/src/routes/ai.ts` and `server/src/services/ai-planner.service.ts`
- block generation and autofill already exist in `server/src/services/ai-content.service.ts`
- wizard session flow and section generation already exist in `server/src/services/ai-wizard.service.ts`
- BullMQ worker infrastructure exists for export workloads
- project content already persists as TipTap JSON in `Project.content`

### Existing Constraints

- generation is still largely request-bound and SSE-driven
- the current wizard outline is capped and flat
- generation state is session-oriented, not production-run oriented
- continuity support is prompt- and memory-based, not canon-based
- there is no generalized evaluator or repair loop integrated into content generation
- large-scale output still depends on linear section generation rather than artifact dependency planning

---

## Target System Overview

The autonomous generation system should be built around six cooperating layers.

## Layer 1: Run Management

Responsible for:
- creating a generation run
- storing intent and configuration
- tracking status and progress
- pause, cancel, retry, resume

## Layer 2: Canon And Planning

Responsible for:
- campaign bible generation
- chapter and appendix decomposition
- page-budget allocation
- narrative and mechanical dependency planning

## Layer 3: Artifact Generation

Responsible for:
- NPC dossiers
- location briefs
- encounters
- item sets
- chapter prose
- handouts
- callouts
- appendices

## Layer 4: Evaluation And Repair

Responsible for:
- artifact scoring
- continuity checks
- formatting validation
- auto-revision loops

## Layer 5: Retrieval And Canon Indexing

Responsible for:
- indexing completed artifacts
- retrieving canon and prior content for later steps
- conflict detection

## Layer 6: Assembly And Review UX

Responsible for:
- building final project documents
- exposing artifacts and evaluations in the UI
- enabling targeted regenerate and accept or reject workflows

---

## Data Model Plan

The current Prisma schema needs a parallel generation domain. Do not overload wizard sessions for this.

## New Prisma Models

### `GenerationRun`

**Purpose:** Represents one autonomous generation attempt.

**Suggested Fields:**
- `id`
- `projectId`
- `userId`
- `mode` — one-shot, module, campaign, sourcebook
- `status` — queued, planning, generating_assets, generating_prose, evaluating, revising, assembling, completed, failed, cancelled, paused
- `inputPrompt`
- `inputParameters` JSON
- `targetProfile` JSON
- `currentStage`
- `progressPercent`
- `estimatedPages`
- `estimatedTokens`
- `estimatedCost`
- `actualTokens`
- `actualCost`
- `failureReason`
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`

### `GenerationTask`

**Purpose:** Represents one unit of work inside a run.

**Suggested Fields:**
- `id`
- `runId`
- `parentTaskId`
- `taskType`
- `artifactType`
- `artifactKey`
- `status`
- `priority`
- `attemptCount`
- `maxAttempts`
- `dependsOn` JSON array
- `inputPayload` JSON
- `resultPayload` JSON
- `errorMessage`
- `workerLeaseId`
- `startedAt`
- `completedAt`

### `CampaignBible`

**Purpose:** Canonical project-level truth.

**Suggested Fields:**
- `id`
- `runId`
- `projectId`
- `version`
- `summary`
- `worldRules` JSON
- `actStructure` JSON
- `timeline` JSON
- `factions` JSON
- `npcs` JSON
- `locations` JSON
- `items` JSON
- `encounterGuidelines` JSON
- `styleGuide` JSON
- `openThreads` JSON
- `createdAt`
- `updatedAt`

### `GeneratedArtifact`

**Purpose:** Stores staged outputs.

**Suggested Fields:**
- `id`
- `runId`
- `projectId`
- `sourceTaskId`
- `artifactType`
- `artifactKey`
- `parentArtifactId`
- `status`
- `version`
- `title`
- `summary`
- `jsonContent`
- `markdownContent`
- `tiptapContent`
- `metadata` JSON
- `pageEstimate`
- `tokenCount`
- `createdAt`
- `updatedAt`

### `ArtifactEvaluation`

**Purpose:** Stores scoring and findings for one artifact version.

**Suggested Fields:**
- `id`
- `artifactId`
- `artifactVersion`
- `evaluationType`
- `score`
- `passed`
- `findings` JSON
- `recommendedActions` JSON
- `evaluatorModel`
- `createdAt`

### `ArtifactRevision`

**Purpose:** Records revise-on-fail loops.

**Suggested Fields:**
- `id`
- `artifactId`
- `fromVersion`
- `toVersion`
- `reason`
- `revisionPromptSummary`
- `createdAt`

### `AssemblyManifest`

**Purpose:** Maps staged artifacts to final assembled documents.

**Suggested Fields:**
- `id`
- `runId`
- `projectId`
- `version`
- `documents` JSON
- `assemblyRules` JSON
- `createdAt`
- `updatedAt`

### `CanonEntity`

**Purpose:** Normalized entities for retrieval and conflict detection.

**Suggested Fields:**
- `id`
- `projectId`
- `runId`
- `entityType`
- `canonicalName`
- `aliases` JSON
- `canonicalData` JSON
- `sourceArtifactId`
- `createdAt`
- `updatedAt`

### `CanonReference`

**Purpose:** Links artifacts to entities they depend on or mention.

**Suggested Fields:**
- `id`
- `artifactId`
- `entityId`
- `referenceType`
- `metadata` JSON

---

## Artifact Taxonomy

Define artifacts before implementation so prompts, queues, evaluation, and UI all align.

## Planning Artifacts

- `project_profile`
- `campaign_bible`
- `chapter_outline`
- `chapter_plan`
- `section_spec`
- `appendix_plan`

## Canon And Reference Artifacts

- `npc_dossier`
- `location_brief`
- `faction_profile`
- `quest_arc`
- `timeline_sheet`
- `item_bundle`
- `monster_bundle`
- `encounter_bundle`

## Written Artifacts

- `chapter_draft`
- `section_draft`
- `sidebar_bundle`
- `read_aloud_bundle`
- `handout_bundle`
- `dm_notes_bundle`
- `appendix_draft`

## Evaluation Artifacts

- `artifact_evaluation`
- `continuity_report`
- `rules_sanity_report`
- `page_budget_report`
- `assembly_preflight_report`

## Assembly Artifacts

- `document_assembly_manifest`
- `assembled_document_snapshot`

---

## Run Lifecycle Plan

Every autonomous generation run should follow a stable lifecycle.

## Stage 0: Intake

**Input:** short prompt plus optional generation mode and page target.

**System Actions:**
- estimate product type
- estimate complexity and page count
- detect missing critical parameters
- decide whether to ask zero, few, or no questions
- create `GenerationRun`

**Outputs:**
- normalized run input
- product profile
- generation budget estimate

## Stage 1: Planning

**System Actions:**
- generate campaign bible
- build act and chapter structure
- allocate page budgets
- generate chapter plans and section specs
- generate appendix plan

**Outputs:**
- `CampaignBible`
- planning artifacts

## Stage 2: Reference Asset Generation

**System Actions:**
- create reusable NPCs, locations, factions, items, monsters, encounters
- index them as canon entities

**Outputs:**
- reference artifacts and canon entries

## Stage 3: Prose Generation

**System Actions:**
- assemble local context
- generate chapter content by section
- convert to TipTap
- store drafts and chunk them for retrieval

**Outputs:**
- `chapter_draft` and related written artifacts

## Stage 4: Evaluation

**System Actions:**
- evaluate all artifacts
- generate reports and determine pass or fail

**Outputs:**
- evaluation artifacts

## Stage 5: Revision

**System Actions:**
- selectively revise failing artifacts
- re-evaluate revised outputs

**Outputs:**
- revision versions and updated evaluations

## Stage 6: Assembly

**System Actions:**
- construct assembly manifest
- generate final project documents
- attach provenance metadata

**Outputs:**
- final assembled TipTap document content

## Stage 7: Publish-Ready Preflight

**System Actions:**
- validate structural completeness
- validate export-readiness
- identify large blank areas or budget overages
- mark run complete or blocked

---

## Queue And Worker Plan

Long-form generation should use BullMQ, not Express request handlers.

## Queues

### `generation:planner`

Responsible for:
- product profile inference
- campaign bible creation
- chapter and appendix decomposition

### `generation:artifacts`

Responsible for:
- NPCs
- locations
- items
- monster bundles
- encounters
- chapter prose slices

### `generation:evaluate`

Responsible for:
- continuity checks
- rules sanity checks
- completeness and formatting evaluation

### `generation:revise`

Responsible for:
- revision passes on failed artifacts

### `generation:assemble`

Responsible for:
- assembly manifest creation
- final project-document assembly

## Worker Rules

1. Tasks must be idempotent.
2. Each task writes durable state transitions.
3. Retries must be bounded and visible.
4. A parent task should not complete until its dependencies are confirmed.
5. Large artifacts should be generated in slices, then composed.

## Checkpointing Strategy

Checkpoint after:
- campaign bible creation
- chapter plan generation
- each reference artifact batch
- each completed chapter draft
- each evaluation wave
- final assembly

---

## API, UX, Evaluation, And Implementation Companions

For concrete request contracts, user flows, scoring rubrics, and task-by-task build order, use the companion docs:
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-api.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-ux.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-evaluation.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-implementation.md`
