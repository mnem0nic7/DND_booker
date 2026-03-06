# Autonomous Campaign Generation Full Plan

**Date:** 2026-03-06
**Authoring Context:** Codex planning document
**Status:** Proposed
**Scope:** Documentation only. This file does not imply that implementation has started.

## Purpose

This plan describes how to evolve DND Booker from an AI-assisted D&D editor into a system that can generate complete campaign material from a short user brief with no required follow-up input. The target range spans:

- short one-shots
- mid-length adventure modules
- long-form campaigns that extend to hundreds of pages

The current codebase already contains strong building blocks:

- project storage and editing
- AI chat and planning state
- wizard-based section generation
- image generation hooks
- PDF and EPUB export

The current architecture does **not** yet support reliable autonomous long-form generation. This plan defines the product target, identifies the current gaps, and lays out a detailed implementation roadmap that can be handed to another engineer or agent for execution.

## Executive Summary

The central change is architectural:

- Stop treating `Project.content` as the AI's only working representation.
- Introduce structured canonical artifacts for story planning, entity continuity, chapter packets, generation tasks, and evaluation results.
- Generate books in layers through a resumable background run pipeline.
- Compile those artifacts into ordered editor documents.
- Let the editor operate on chapter-sized documents rather than one monolithic TipTap tree.

This approach is required because the current system is limited by:

- a mostly interactive chat and wizard flow in `server/src/routes/ai.ts`
- small-outline generation in `server/src/services/ai-wizard.service.ts`
- prompt-driven continuity rather than canonical data
- truncated document context in `server/src/services/ai-content.service.ts`
- one large document save model in `client/src/stores/projectStore.ts`
- one full-book editor instance in `client/src/components/editor/EditorLayout.tsx`
- export assembly that still effectively treats the project as one document in `worker/src/jobs/export.job.ts`

The target product has two explicit AI modes:

1. `Interactive Authoring`
   Existing editor/chat workflow for manual creation, revision, and insertion of blocks.

2. `Autonomous Generation`
   A background run system that accepts a short prompt, plans the book, generates structured artifacts, writes chapters, evaluates quality, repairs weak sections, assembles the project, and leaves the result ready for editing and export.

## Current State

## Existing Strengths

The current repository already contains the foundation needed for this initiative:

- AI chat with project context in `server/src/routes/ai.ts`
- rolling working memory, task plan, and long-term memory in `server/src/services/ai-planner.service.ts` and `server/src/services/ai-memory.service.ts`
- content prompts and document outline helpers in `server/src/services/ai-content.service.ts`
- wizard session flow and section generation in `server/src/services/ai-wizard.service.ts`
- tool registry and CRUD/content tools in `server/src/services/ai-tools/`
- project persistence in `server/prisma/schema.prisma`
- a rich TipTap editor with D&D blocks in `client/src/components/editor/EditorLayout.tsx`
- export infrastructure in `worker/src/jobs/export.job.ts` and the Typst/HTML renderers

## Current Constraints

The current implementation is still optimized for assisted authoring, not autonomous generation.

### Constraint 1: The primary AI workflow is interactive

The core system prompt in `server/src/services/ai-content.service.ts` still prioritizes a question-first adventure creation flow and emits `_wizardGenerate` control blocks. The product target here requires generation from the initial prompt alone.

### Constraint 2: The current wizard is too flat

`server/src/services/ai-wizard.service.ts` generates an outline with a small number of sections and then writes them linearly. That works for a one-shot prototype, but it does not scale to 80-300 page outputs.

### Constraint 3: Continuity support is shallow

The system currently relies on:

- recent chat history
- working memory bullets
- long-term memory notes
- brief per-section summaries
- a truncated document outline and sampled text

That is not enough to preserve consistency across many chapters, recurring NPCs, quest arcs, locations, and appendices.

### Constraint 4: The project is still modeled as one large document blob

`Project.content` in `server/prisma/schema.prisma` is a single JSON field. This is easy for a small editor, but it makes autonomous generation, targeted regeneration, partial saves, and long-form editing harder than necessary.

### Constraint 5: The editor assumes one active full-book TipTap instance

`client/src/components/editor/EditorLayout.tsx` loads one document into TipTap. `client/src/stores/projectStore.ts` saves the entire document JSON during autosave. This becomes a bottleneck for hundreds of pages.

### Constraint 6: Export is only partially multi-document aware

The worker assemblers already accept arrays of documents, but `worker/src/jobs/export.job.ts` still wraps the project as a synthetic single-element document list. That prevents true chapter-level assembly.

### Constraint 7: There is no integrated evaluation and repair loop

The current evaluation capabilities are useful for interactive critique, but there is no autonomous acceptance gate that can reject, revise, retry, and repair content before finalizing a run.

### Constraint 8: There is no production run domain

The current persistence model supports chat sessions and wizard sessions, but not durable autonomous generation runs with:

- phase progression
- retries
- resumability
- task dependencies
- cost tracking
- stage-level artifacts

## Product Definition

The product should explicitly support the following autonomous generation outputs.

## Supported Output Types

### Mode 1: Prompt to One-Shot

**Target Length:** 8 to 20 pages

**Example Briefs:**

- "Create a level 4 swamp horror one-shot about a drowned chapel."
- "Write a level 2 goblin cave adventure for new players."

**Expected Output:**

- title page
- adventure summary
- DM overview
- 2 to 5 core scenes or chapters
- 2 to 6 encounters
- necessary NPCs
- treasure and rewards
- optional handout or map brief
- credits and back matter where appropriate

### Mode 2: Prompt to Adventure Module

**Target Length:** 24 to 60 pages

**Expected Output:**

- front matter
- structured introduction and hook
- multiple adventure chapters
- recurring NPCs and location briefs
- stat appendix or encounter appendix if warranted
- publication-ready organization

### Mode 3: Prompt to Mini-Campaign

**Target Length:** 40 to 80 pages

**Expected Output:**

- campaign bible
- chapter progression across multiple sessions
- recurring locations, factions, and quest hooks
- handouts, items, and encounter tables
- appendices and supporting reference content

### Mode 4: Prompt to Full Campaign

**Target Length:** 150 to 300 pages

**Expected Output:**

- campaign bible
- act structure
- chapter packets
- recurring NPC arcs and factions
- substantial location coverage
- quest graph
- encounter and reward progression
- appendices and reference sections
- staged generation and resumable execution

## Product Principles

1. **No mandatory follow-up questions**
   The initial brief is sufficient to start and finish an autonomous run. Optional user refinement can still exist, but it is not required.

2. **Structured planning before prose**
   Canon and planning artifacts must exist before chapter text is written.

3. **Canon over drift**
   Entity continuity and plot continuity are governed by canonical structured data rather than informal prompt memory.

4. **Runs survive disconnects**
   Long generations cannot depend on a browser tab remaining open.

5. **Generated artifacts are inspectable**
   Users should be able to inspect the campaign bible, entities, chapter structure, evaluation findings, and repair activity.

6. **The first draft is not assumed correct**
   Evaluation and repair are mandatory parts of the pipeline.

7. **The editor remains usable**
   Autonomous generation must not degrade the manual editor experience.

## Non-Goals For The First Major Release

- fully automatic tactical maps with guaranteed battle-ready geometry
- perfect encounter balance without evaluation or human review
- non-5e systems
- collaborative multi-user editing of an active autonomous run
- guaranteed zero hallucination
- guaranteed sub-minute generation for 150+ page outputs

## Target Architecture

The target system should be implemented as six cooperating layers.

## Layer 1: Run Management

Responsible for:

- starting a generation run
- persisting run status
- resuming and retrying work
- tracking progress and cost
- cancellation and failure handling

## Layer 2: Canon and Planning

Responsible for:

- normalizing the input brief
- generating the campaign bible
- allocating page budgets
- building the chapter and appendix structure
- constructing the dependency graph for entities and chapters

## Layer 3: Artifact Generation

Responsible for:

- NPC dossiers
- factions
- location briefs
- quest summaries
- encounter specs
- treasure specs
- handout prompts
- chapter packets
- final chapter prose and blocks

## Layer 4: Retrieval and Continuity

Responsible for:

- chunking canonical artifacts and generated outputs
- retrieving relevant continuity data for later stages
- detecting conflicts between canonical records and chapter drafts

## Layer 5: Evaluation and Repair

Responsible for:

- scoring content quality
- checking continuity
- checking layout and formatting readiness
- issuing targeted repair tasks
- final acceptance gates

## Layer 6: Assembly and Review UX

Responsible for:

- compiling canonical and prose artifacts into `ProjectDocument` units
- rendering project structure in the UI
- exposing run progress and findings
- exporting the completed project

## Data Model Plan

The current Prisma schema should gain a parallel autonomous-generation domain. This should not be shoehorned into `AiWizardSession`.

## New Models

### `GenerationRun`

Represents one autonomous generation attempt.

**Fields:**

- `id`
- `projectId`
- `userId`
- `scopePreset`
- `targetPageCount`
- `status`
- `currentPhase`
- `inputBrief`
- `normalizedInputJson`
- `provider`
- `model`
- `autoImages`
- `autoApply`
- `estimatedTokens`
- `estimatedCost`
- `actualTokens`
- `actualCost`
- `failureCode`
- `failureMessage`
- `metricsJson`
- `createdAt`
- `startedAt`
- `completedAt`
- `updatedAt`

### `GenerationTask`

Represents one executable unit of work in a run.

**Fields:**

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
- `dependencyKeysJson`
- `inputPayloadJson`
- `resultPayloadJson`
- `errorMessage`
- `startedAt`
- `completedAt`
- `createdAt`
- `updatedAt`

### `CampaignBible`

Canonical book-level planning artifact.

**Fields:**

- `id`
- `projectId`
- `runId`
- `title`
- `scopePreset`
- `summary`
- `premise`
- `toneRulesJson`
- `settingRulesJson`
- `levelBandJson`
- `storySpineJson`
- `continuityRulesJson`
- `pageBudgetJson`
- `styleGuideJson`
- `status`
- `createdAt`
- `updatedAt`

### `CampaignEntity`

Canonical entity store for all recurring content.

**Supported `entityType` values:**

- `npc`
- `location`
- `faction`
- `quest`
- `encounter`
- `magic_item`
- `monster`
- `handout`
- `map`
- `rumor`

**Fields:**

- `id`
- `projectId`
- `runId`
- `entityType`
- `slug`
- `name`
- `summary`
- `canonicalJson`
- `searchText`
- `status`
- `createdAt`
- `updatedAt`

### `ProjectDocument`

An ordered editor document unit.

This becomes the primary editable output representation.

**Supported `kind` values:**

- `front_matter`
- `chapter`
- `appendix`
- `back_matter`

**Fields:**

- `id`
- `projectId`
- `runId`
- `kind`
- `title`
- `slug`
- `sortOrder`
- `targetPageCount`
- `outlineJson`
- `content`
- `status`
- `createdAt`
- `updatedAt`

### `KnowledgeChunk`

Searchable chunk store for retrieval.

**Fields:**

- `id`
- `projectId`
- `runId`
- `sourceType`
- `sourceId`
- `chunkKey`
- `headingPath`
- `text`
- `attrsJson`
- `searchText`
- `createdAt`
- `updatedAt`

### `ProjectSnapshot`

Immutable checkpoint for rollback and run auditing.

**Fields:**

- `id`
- `projectId`
- `runId`
- `snapshotType`
- `summary`
- `projectContentJson`
- `documentsJson`
- `createdAt`

## Compatibility Strategy

The current `Project.content` field should remain during migration.

Short-term policy:

- `ProjectDocument[]` becomes the canonical generated output.
- `Project.content` is compiled from those documents for compatibility with the current editor and routes.
- Once the chapter/document-based editor is complete, `Project.content` remains a cache rather than the primary source of truth.

## Shared Types Plan

Add the following shared type families:

- `GenerationScopePreset`
- `GenerationRunStatus`
- `GenerationPhase`
- `ProjectDocumentKind`
- `GenerationRun`
- `GenerationTask`
- `CampaignBible`
- `CampaignEntity`
- `ProjectDocument`
- `KnowledgeChunk`
- `GenerationEvent`
- `GenerationEvaluation`
- `GenerationRepairAction`

## API Plan

Introduce a dedicated autonomous run API.

## New Endpoints

### `POST /api/projects/:id/ai/runs`

Starts an autonomous generation run.

**Request Body:**

- `brief: string`
- `scopePreset?: 'one_shot' | 'mini_campaign' | 'full_campaign'`
- `targetPageCount?: number`
- `autoImages?: boolean`
- `autoApply?: boolean`

**Default Behavior:**

- `scopePreset` inferred if omitted
- `targetPageCount` derived from preset if omitted
- `autoImages = false`
- `autoApply = true`

**Response:**

- run metadata
- initial phase
- event stream URL

### `GET /api/projects/:id/ai/runs`

Returns generation run history for the project.

### `GET /api/projects/:id/ai/runs/:runId`

Returns current run state, phase data, progress, evaluation summary, and errors.

### `GET /api/projects/:id/ai/runs/:runId/events`

Streams run progress events.

### `POST /api/projects/:id/ai/runs/:runId/cancel`

Cancels the active run.

### `POST /api/projects/:id/ai/runs/:runId/retry`

Retries a failed run or selected failed tasks.

### `GET /api/projects/:id/documents`

Returns ordered project documents.

### `GET /api/documents/:id`

Returns one project document for editing.

### `PUT /api/documents/:id/content`

Updates one project document.

This route should require optimistic concurrency via `expectedUpdatedAt`.

### `POST /api/projects/:id/documents/reorder`

Reorders project documents.

## Existing Endpoint Policy

- Keep the current chat endpoints intact.
- Keep block generation and autofill intact.
- Keep wizard endpoints during migration.
- Route future chat-triggered autonomous generation through `GenerationRun` once the new flow is stable.

## Autonomous Generation Pipeline

The pipeline should be implemented as persisted background stages, not one long request.

## Stage 1: Brief Normalization

**Goal:** Turn a compact user prompt into a fully specified internal request.

**Inputs:**

- raw brief
- project type if already set
- project title if already set
- optional user preferences from memory

**Outputs:**

- normalized brief JSON
- inferred scope preset
- inferred tone
- inferred level range
- inferred product structure
- initial page target

**Rules:**

- never ask the user follow-up questions for missing information
- fill gaps with deterministic defaults
- store all inferred assumptions in run metadata

## Stage 2: Campaign Bible Generation

**Goal:** Create the canonical book-level planning artifact.

**Outputs:**

- campaign premise
- main conflict
- antagonist and opposition frame
- thematic rules
- setting rules
- level progression or milestone shape
- pacing rules
- forbidden contradictions
- page budget allocation

**Acceptance Criteria:**

- enough structure to support entity generation and chapter decomposition
- no unresolved ambiguity about the basic campaign shape

## Stage 3: Entity Graph Generation

**Goal:** Establish canonical reusable entities before prose.

**Outputs:**

- NPC set
- faction set
- location set
- quest set
- encounter seeds
- treasure seeds
- handout seeds

**Rules:**

- every recurring entity gets a stable id and slug
- entities include searchable summary text
- entity relationships are stored in canonical JSON

## Stage 4: Macro Outline Generation

**Goal:** Build the act and chapter structure for the full book.

**Outputs:**

- document plan
- act plan where appropriate
- chapter list
- appendix candidates
- target page budgets per section

**Rules:**

- one-shots can stay scene-based
- mini/full campaigns must have chapter-level planning
- appendices are planned separately rather than inserted ad hoc into story chapters

## Stage 5: Chapter Packet Generation

**Goal:** Create a structured generation packet for each chapter.

**Each chapter packet includes:**

- chapter purpose
- chapter summary
- required entities
- incoming continuity requirements
- outgoing continuity requirements
- encounter budget
- expected D&D blocks
- target page count
- required stat blocks, tables, items, and handouts

**Why this stage matters:**

It separates planning from prose and gives the writer a bounded, deterministic context.

## Stage 6: Chapter Writing

**Goal:** Write chapter content and D&D blocks into chapter-sized `ProjectDocument` outputs.

**Inputs for the writer:**

- chapter packet
- relevant campaign bible excerpts
- required entities
- only the continuity chunks needed from previous chapters

**Outputs:**

- chapter TipTap content
- writing summary
- generated block inventory
- chunked retrieval records

**Rules:**

- do not generate the entire book in a single prompt
- write one chapter or document unit at a time
- chunk and index output immediately after completion

## Stage 7: Front Matter and Appendix Generation

**Goal:** Create non-chapter documents from the canonical project state.

**Possible outputs:**

- title page
- DM introduction
- table of contents placeholder
- credits
- legal text
- monster appendix
- NPC appendix
- magic item appendix
- handout appendix
- back cover

## Stage 8: Document Compilation

**Goal:** Assemble ordered `ProjectDocument[]` and refresh compatibility caches.

**Outputs:**

- ordered documents
- compiled `Project.content` cache
- export-ready structure

## Stage 9: Evaluation

**Goal:** Judge whether the generated book is acceptable.

**Evaluation dimensions:**

- narrative quality
- continuity
- encounter and rules plausibility
- completeness
- formatting readiness
- layout readiness

**Outputs:**

- evaluator score
- structured findings
- repair task list

## Stage 10: Repair

**Goal:** Fix the identified weak areas without regenerating the entire book.

**Repair targets:**

- individual chapters
- appendices
- entities
- front matter
- layout metadata

**Policy:**

- maximum 2 repair rounds
- maximum 1 targeted retry per failed chapter/task
- fail the run if critical issues remain after the limit

## Orchestration Plan

Use BullMQ to execute the autonomous pipeline as a durable, resumable workflow.

## Queue Strategy

### `generation-run`

Top-level run scheduler queue.

Responsibilities:

- enqueue stages
- transition phases
- detect retries and resumptions

### `generation-task`

Executes entity generation, chapter packet generation, chapter writing, appendix writing, repair tasks, and evaluations.

### `generation-index`

Responsible for chunking and indexing artifacts into `KnowledgeChunk`.

### `generation-assemble`

Responsible for compiling `ProjectDocument[]` and compatibility caches.

### `generation-evaluate`

Runs evaluators and emits repair tasks.

## Task Dependency Rules

- no chapter writing begins until the campaign bible and entity graph are accepted
- chapter packet generation must complete before prose generation
- appendices depend on the existence of their source entities/artifacts
- final assembly depends on completed chapter documents
- evaluation depends on assembly
- repair depends on evaluation findings

## Retry Rules

- transient provider errors should retry automatically
- structural parse failures should retry with a repair prompt variant
- persistent failures should mark the task failed and bubble to the run

## Prompt and Model Strategy

The current system prompt should be split by responsibility rather than stretched further.

## Separate Logical Roles

### Role 1: Brief Normalizer

Converts the user brief into deterministic structured input.

### Role 2: Bible Planner

Creates the campaign bible and page budgets.

### Role 3: Entity Planner

Creates canonical reusable entities.

### Role 4: Chapter Planner

Creates chapter packets.

### Role 5: Chapter Writer

Writes final chapter content and blocks.

### Role 6: Evaluator

Scores the assembled output and emits structured findings.

### Role 7: Repair Writer

Executes targeted rewrites against weak sections.

## Prompting Rules

- prompts should request structured JSON first wherever possible
- prose prompts should consume structured packets, not raw user briefs
- long-form continuity should be driven by retrieved chunks and entity references, not raw prior chapter dumps
- every prompt should include explicit output contracts
- every stage should produce machine-parseable artifacts

## Provider Policy

### Supported For Autonomous Generation In V1

- Anthropic
- OpenAI

### Not Supported For Autonomous Generation In V1

- Ollama by default

Ollama may remain available for interactive chat, but it should not be enabled for 80-300 page runs until it passes:

- quality benchmarks
- latency benchmarks
- retry/resumption reliability checks

## Retrieval and Continuity Plan

This is the key system for scaling beyond one-shot generation.

## `KnowledgeChunk` Sources

Chunk and index:

- campaign bible sections
- canonical entities
- chapter packets
- completed chapter summaries
- generated prose blocks
- evaluation summaries

## Retrieval Strategy

Use PostgreSQL text search plus structured filters in v1.

Filters should include:

- `projectId`
- `runId`
- `sourceType`
- `entity ids`
- `chapter ids`
- heading path

## Continuity Rules

- recurring entities must always be referenced by canonical ids internally
- chapter packets should explicitly list required entities and forbidden contradictions
- repair passes should update canonical entities first if the issue is canonical, then rebuild dependent outputs

## Conflict Detection

At minimum, detect:

- renamed recurring NPCs
- inconsistent location details
- contradictory faction motives
- duplicate quest names for distinct quests
- level or progression contradictions
- appendix drift from in-story content

## Editor and Client Migration Plan

The current editor must be migrated away from a single active full-book TipTap document.

## New UX Model

### Project Workspace

The project page should show:

- document navigator
- active document editor
- run progress panel
- generation history
- evaluation summary

### Document Navigator

Should group documents by:

- front matter
- chapters
- appendices
- back matter

### Active Editor

Loads only one `ProjectDocument` at a time.

### Preview

Live preview should be document-scoped.

Full-book preview should be generated from compiled documents or export snapshots, not from a single huge live DOM.

## Save Model Changes

Current behavior in `client/src/stores/projectStore.ts` saves the entire project content blob.

Target behavior:

- save the active document only
- use optimistic concurrency per document
- keep autosave behavior
- stop sending full-book content on every change

## AI Chat Policy In The New UI

- keep interactive chat focused on the active document
- allow the user to start an autonomous run from the AI panel or a dedicated "Generate Project" action
- show run progress in the same project workspace, not as a one-time wizard overlay

## Export Plan

The worker already has document-array assembly support. The missing piece is to load real ordered documents.

## Export Changes

- load `ProjectDocument[]` in order instead of synthesizing a one-element list
- build TOC from all documents
- preserve front matter and appendices as separate ordered units
- export should not care whether the book was created manually or by autonomous generation

## Export Acceptance Criteria

- full-book PDF order is correct
- full-book EPUB order is correct
- TOC includes headings across documents
- appendices appear at the end
- no dependency on legacy single-document storage

## Evaluation and Repair System

Autonomous generation requires hard acceptance gates.

## Evaluation Dimensions

### Narrative

- premise clarity
- pacing
- completeness
- climax and resolution
- chapter transitions

### Continuity

- entity consistency
- quest continuity
- faction continuity
- location continuity

### Mechanical Plausibility

- encounter difficulty progression
- reward pacing
- presence of supporting stat blocks or references

### Formatting and Layout Readiness

- no blank pages
- minimal nearly blank pages
- chapter structure makes sense
- block placement is contextually appropriate

## Acceptance Gates

The run should not finalize unless all of the following are true:

- no critical continuity issues remain
- all required chapters are present
- no required document failed generation
- evaluator score is at least 8/10
- blank pages equal 0
- nearly blank pages remain below 3 percent of total pages

## Repair Actions

Repair actions may:

- regenerate a failed chapter
- rewrite a weak chapter
- update a canonical entity
- recompile appendices
- fix front matter or metadata
- rerun evaluation after changes

## Observability and Cost Controls

Long autonomous runs need first-class telemetry.

## Metrics To Capture

- provider
- model
- prompt version
- stage timings
- attempts and retries
- per-stage token counts
- estimated cost
- actual cost
- output sizes
- failure types

## Run Detail UI Should Expose

- current phase
- completed phases
- task counts
- chapter completion
- failure reason if applicable
- evaluation summary
- repair history

## Budget Controls

Add server-side limits for:

- target page count
- maximum chapters per preset
- maximum retries
- maximum total tokens per run

## Preset Defaults

### `one_shot`

- target pages: 10 to 18
- scenes/chapters: 3 to 5
- encounters: 2 to 6

### `mini_campaign`

- target pages: 50 to 70
- chapters: 6 to 10
- recurring NPCs: 4 to 10
- recurring locations: 4 to 12

### `full_campaign`

- target pages: 180 to 240 by default
- chapters: 12 to 20
- recurring NPCs: 8 to 20
- recurring locations: 10 to 25
- appendices required

## Implementation Roadmap

## Phase 0: Planning and Schema Prep

### Deliverables

- confirm autonomous generation presets
- finalize run phases and statuses
- finalize new Prisma model set
- finalize API contracts

### Exit Criteria

- schema and API decisions are stable enough to implement

## Phase 1: Run Infrastructure

### Deliverables

- `GenerationRun`
- `GenerationTask`
- run APIs
- BullMQ orchestration
- phase persistence
- run event streaming
- cancellation and retry

### Exit Criteria

- a run can be created and progress durably through mocked phases

## Phase 2: Canon and Planning

### Deliverables

- brief normalization
- campaign bible generation
- entity graph generation
- macro outline generation
- chapter packet generation

### Exit Criteria

- structured planning artifacts exist for one-shot and mini-campaign runs

## Phase 3: Autonomous One-Shot

### Deliverables

- chapter writing
- front matter generation
- appendix generation where needed
- document compilation
- evaluation pass
- one repair loop

### Exit Criteria

- a short prompt yields a complete one-shot without user follow-up

## Phase 4: Mini-Campaign

### Deliverables

- stronger entity reuse
- chapter packet retrieval
- appendices
- targeted repairs
- better continuity evaluation

### Exit Criteria

- 40-80 page runs are coherent across chapters

## Phase 5: Editor Migration

### Deliverables

- `ProjectDocument` list UI
- active-document editing
- per-document save endpoints
- project workspace navigation
- run progress UI

### Exit Criteria

- editing a large project no longer depends on a monolithic full-book TipTap instance

## Phase 6: Full Campaign

### Deliverables

- 150-300 page presets
- stronger retrieval
- multi-round repair
- cost and scale telemetry
- export from true document arrays

### Exit Criteria

- a full campaign can be generated, evaluated, repaired, compiled, and exported autonomously

## Phase 7: Hardening and Cleanup

### Deliverables

- route chat-triggered generation to the new run system
- deprecate wizard-only autonomous flow
- keep interactive authoring intact
- complete benchmark suite

### Exit Criteria

- one canonical autonomous generation path exists in production

## Test Plan

## Unit Tests

- brief normalization
- scope inference
- page-budget allocation
- entity canonicalization
- chapter packet creation
- chapter writer parsing
- evaluation scoring
- repair selection logic

## Integration Tests

- run creation
- run progress streaming
- task retries
- run cancellation
- document CRUD with optimistic concurrency
- chunk indexing
- chunk retrieval by structured filters
- assembly of `ProjectDocument[]`
- compatibility compilation into `Project.content`

## End-To-End Tests

- prompt to one-shot
- prompt to mini-campaign
- prompt to full campaign
- run fails one chapter and recovers
- user opens generated project and edits one chapter
- export full generated project to PDF and EPUB

## Performance Tests

Benchmark projects at:

- 10 pages
- 50 pages
- 150 pages
- 300 pages

Measure:

- chapter load time
- autosave payload size
- browser memory usage
- export completion time
- run duration

## Golden Prompt Suite

Maintain a stable set of prompts for regression:

- generic fantasy one-shot
- horror mini-campaign
- urban intrigue campaign
- wilderness hex-style campaign

Compare across releases:

- continuity quality
- completeness
- evaluator findings
- repair counts

## Risks and Mitigations

### Risk: Cost explosion on large runs

**Mitigation:** chapter packets, bounded retrieval, hard retry limits, preset page budgets, run telemetry

### Risk: Continuity drift

**Mitigation:** canonical entity graph, structured retrieval, evaluator gates, repair loops

### Risk: Editor performance collapse

**Mitigation:** migrate to per-document editing before full-campaign release

### Risk: Export mismatch

**Mitigation:** compile everything through ordered `ProjectDocument[]` and use the same structure for export

### Risk: Provider inconsistency

**Mitigation:** provider gating, quality benchmarks, clear unsupported-provider policy

## Explicit Defaults and Assumptions

- The initial user brief is the only required input for autonomous generation.
- Users may optionally refine or regenerate after completion, but the first completed run should be usable as delivered.
- The content target is original 5e-compatible material, not guaranteed canonical reproduction of proprietary settings unless the user supplies source material.
- OpenAI and Anthropic are the autonomous-generation providers in v1.
- Ollama remains interactive-only until it passes scale and quality validation.
- `autoApply` defaults to `true`.
- `autoImages` defaults to `false`.
- Export remains a separate user action in v1 even though output must be export-ready.
- Existing manual authoring and export features must continue working during migration.

## Definition of Success

This initiative is successful when the system can take a prompt such as:

`Create a 180-page gothic horror campaign for levels 3-10 set in a decaying marsh kingdom ruled by a drowned saint and rival witch covens.`

and autonomously produce:

- a coherent project structure
- canonical recurring entities
- chapter-sized editable documents
- complete campaign content
- appendices and supporting reference material
- evaluation-approved output
- export-ready project data

with no required follow-up answers from the user.
