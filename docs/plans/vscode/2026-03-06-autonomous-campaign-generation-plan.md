# Autonomous Campaign Generation Gap Analysis And Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable DND Booker to generate publication-ready D&D material with minimal or no iterative user input, ranging from compact one-shots to long-form campaigns and sourcebook-scale projects that can span hundreds of pages.

**Primary Constraint:** The system must remain grounded in the existing architecture: React client, Express API, Prisma/Postgres persistence, BullMQ worker infrastructure, TipTap JSON document model, and the current AI chat/tooling layer.

**Scope:** This plan covers gap analysis, target architecture, phased implementation, success criteria, and rollout strategy. It assumes the product should support both:
- prompt-only generation: one initial brief, then full autonomous generation
- guided generation: optional review checkpoints where the user can intervene

**Companion Docs:**
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-detailed-plan.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-design.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-api.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-ux.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-evaluation.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-implementation.md`

---

## Executive Summary

The current project has the beginnings of autonomous generation, but it is not yet capable of reliably producing full campaign books end-to-end.

Today the app can:
- generate individual D&D blocks
- auto-fill block fields
- stream AI chat with planning state
- generate an outline and section content through the wizard flow
- append generated sections into a project document

The current system cannot yet:
- decompose a single short brief into a complete multi-document campaign package
- maintain long-range narrative, rules, lore, NPC, item, and timeline consistency over hundreds of pages
- generate in the background over long durations with resumability and retry safety
- enforce page budgets, structural completeness, and editorial quality automatically
- run multi-pass review and revision loops before material is inserted into the project
- scale output beyond the current section-count, token, and request-lifetime limits

The core implementation direction should be:
1. Move from section generation to hierarchical book generation.
2. Introduce a durable generation pipeline backed by BullMQ jobs and persisted generation state.
3. Add a campaign bible plus structured content graph to maintain continuity.
4. Add evaluator and repair loops so quality is enforced, not assumed.
5. Treat generated content as staged assets that are reviewed and assembled into the final TipTap document, rather than writing everything directly in one pass.

---

## Current State Assessment

### What Already Exists

The existing implementation provides useful building blocks:

- AI chat with project context, planning state, and tool calls in `server/src/routes/ai.ts`
- planning memory and task-plan extraction in `server/src/services/ai-planner.service.ts`
- wizard session storage and prompt builders in `server/src/services/ai-wizard.service.ts`
- client-side wizard streaming state in `client/src/stores/aiStore.ts`
- block generation, outline extraction, and document-context helpers in `server/src/services/ai-content.service.ts`
- an in-progress tool-registry direction including `generateAdventure` in `server/src/services/ai-tools/content/generate-adventure.ts`
- persisted project content in JSON via the `Project.content` field in `server/prisma/schema.prisma`
- worker infrastructure already used for exports, which is the right foundation for long-running generation jobs

### What The Current Wizard Actually Does

The current wizard is best described as outline-driven section generation, not full autonomous campaign authoring.

Key constraints visible in the current implementation:

- outline schema is capped at 20 sections in `server/src/routes/ai.ts`
- generation is sequential and request-bound over SSE, not queued background work
- progress is tracked only at the section level, not at chapter, arc, NPC, encounter, or asset levels
- generated sections are stored as a flat array in `AiWizardSession.sections`
- there is no durable dependency graph for content generation or revision
- the user still has to apply selected sections into the document
- there is no automatic completeness check for “did we produce a full playable campaign package?”

---

## Gap Analysis

## Gap 1: Product Workflow Is Too Narrow

### Current

The system is centered on a single outline and a linear section-generation pass.

### Required

The product needs a full campaign-production workflow:

- brief intake
- project type inference
- scope estimation
- campaign bible generation
- high-level outline generation
- chapter breakdown
- sub-asset generation for NPCs, monsters, treasures, maps, handouts, appendices
- quality review
- revision loop
- final assembly into one or more documents

### Consequence

Without this workflow, the system can produce content fragments, but not a coherent deliverable at book scale.

## Gap 2: No Hierarchical Planning Model

### Current

The top-level unit is `WizardOutlineSection`.

### Required

Generation needs at least these planning levels:

- Project brief
- Campaign bible
- Product structure: chapters, appendices, sidebars, handouts
- Story arcs
- Locations
- NPC roster
- Encounter catalog
- Item and reward catalog
- Chapter plans
- Scene or section specs
- Block specs

### Consequence

Long-form generation currently has no stable intermediate representation. That makes consistency, retries, and targeted regeneration much harder.

## Gap 3: No Campaign Bible Or Canonical Source Of Truth

### Current

The system has working memory and long-term memory, but not a formal world-state or canon model.

### Required

A structured campaign bible should persist:

- setting assumptions
- theme and tone rules
- continuity rules
- timeline and calendar
- factions
- NPCs and relationships
- location index
- recurring items and lore terms
- encounter difficulty targets
- style guide and voice guide
- unresolved plot threads

### Consequence

The generator will drift over long runs. Names, CR values, locations, motives, and lore details will become inconsistent across chapters.

## Gap 4: No Long-Running Job Orchestration

### Current

Generation happens in request-response flows with SSE. The current limits include `MAX_AI_RESPONSE_TOKENS`, `MAX_SSE_BYTES`, and synchronous section iteration.

### Required

Book-length generation needs durable asynchronous orchestration:

- queued jobs
- resumable state
- retries with idempotency
- partial failure recovery
- job progress by stage and artifact
- worker concurrency controls
- cancellation and resume

### Consequence

Hundreds-page generation will fail unpredictably under network interruptions, request timeouts, provider hiccups, or browser disconnects.

## Gap 5: No Retrieval-Backed Consistency Layer

### Current

There is some document-outline and text-sample context injection, and there is a planned `ContentChunk` model in the AI tools design.

### Required

The system needs retrieval against generated artifacts and canonical state:

- chunked content index
- entity-aware retrieval for NPCs, locations, quests, items, lore
- chapter-local context
- campaign-global context
- freshness tracking
- conflict detection when new content contradicts canon

### Consequence

Long-form generation cannot remain coherent if each step sees only a narrow sliding text window.

## Gap 6: No Structured QA Or Revision Loop

### Current

The project has the concept of `evaluateDocument`, but not a full review pipeline integrated into autonomous generation.

### Required

Every generated artifact should pass evaluation dimensions such as:

- D&D 5e rules sanity
- encounter balance target
- completeness for chapter goals
- internal continuity
- reference integrity
- readability and formatting
- page-budget adherence
- repetition detection
- spoiler/control of information placement

### Consequence

A single-pass generator will produce plausible text, but not reliably playable or publishable long-form material.

## Gap 7: No Page-Budget Or Publication Planner

### Current

The editor has page metrics and export infrastructure, but generation does not plan against page counts.

### Required

The system must support target sizes such as:

- 8 to 16 page one-shot
- 24 to 48 page adventure
- 80 to 160 page campaign book
- 200+ page campaign or sourcebook

This requires:

- page budgets per chapter
- content density targets
- chapter and appendix allocation
- overflow handling
- export preflight checks

### Consequence

The app can generate text, but not reliably generate the right amount of text in the right structure for publication.

## Gap 8: Data Model Is Session-Oriented, Not Production-Oriented

### Current

The primary AI persistence objects are chat messages, wizard sessions, working memory, memory items, and task plans.

### Required

Persistent production entities are needed:

- generation runs
- generation tasks
- campaign bibles
- content artifacts
- evaluation reports
- revisions
- assembly manifests
- style profiles

### Consequence

The current persistence model does not support auditing or recovering a multi-hour, multi-step autonomous generation process.

## Gap 9: Output Is Monolithic Too Early

### Current

Generated sections are turned into TipTap content quickly and then applied to the project.

### Required

The pipeline should stage output as artifacts first, then assemble into final documents later.

Artifact examples:

- chapter brief
- chapter prose
- stat block set
- NPC appendix entries
- treasure appendix entries
- player handouts
- map briefs
- editor notes

### Consequence

Without staging, targeted regeneration is expensive and destructive. One weak chapter can force regeneration of too much surrounding content.

## Gap 10: Tests Do Not Cover Long-Form Autonomous Generation

### Current

Tests appear focused on routes, block generation, planner parsing, and wizard behavior.

### Required

Autonomous generation needs:

- unit tests for decomposition logic
- golden tests for structured outputs
- integration tests for generation runs and retry behavior
- consistency tests for campaign bible references
- evaluation-loop tests
- cost and token-budget simulations

### Consequence

The product can regress in subtle ways that only appear in long-form generation workloads.

---

## Target Capability Definition

The target capability should support four generation modes:

1. **Quick One-Shot**
User gives one prompt. System creates a playable 8 to 16 page adventure in one run.

2. **Adventure Module**
User gives one prompt. System creates a multi-chapter 24 to 48 page module with appendices and assets.

3. **Campaign Book**
User gives one prompt. System creates a long-form campaign with chapters, recurring NPCs, major locations, encounter progression, and appendices.

4. **Sourcebook-Like Generation**
User gives one prompt. System creates a broad content product with lore chapters, class or race options, items, tables, and reference sections.

Success means:

- the user can start with a short brief
- the system can infer a reasonable structure
- the system can generate in the background over extended time
- the system can recover from partial failures
- the output is internally coherent and publication-oriented
- the user can inspect and regenerate specific pieces instead of restarting everything

---

## Target Architecture

## 1. Generation Blueprint Layer

Introduce a durable planning representation that sits above raw document content.

Core entities:

- `GenerationRun`
- `GenerationTask`
- `CampaignBible`
- `StoryArc`
- `ChapterPlan`
- `SectionSpec`
- `ContentArtifact`
- `EvaluationReport`
- `AssemblyManifest`

## 2. Hierarchical Generation Pipeline

The pipeline should look like this:

1. Intake brief
2. Infer product profile and size target
3. Generate campaign bible
4. Generate high-level structure
5. Generate chapter plans
6. Generate reference assets first
7. Generate chapter prose against the bible and assets
8. Evaluate each artifact
9. Revise failing artifacts
10. Assemble documents
11. Run final preflight
12. Mark run complete

## 3. Worker-Based Orchestration

Move long-running generation to BullMQ workers with small, idempotent tasks.

Suggested queue groups:

- `generation:plan`
- `generation:artifact`
- `generation:evaluate`
- `generation:revise`
- `generation:assemble`

## 4. Canon And Retrieval Layer

Use a combination of structured entities plus chunk retrieval.

Structured entities cover:

- NPCs
- locations
- factions
- items
- timeline beats
- quests and subquests
- encounter templates

Chunk retrieval covers:

- chapter prose
- handouts
- callouts
- appendix sections

## 5. Staging And Assembly Layer

Generated artifacts should remain separate from the main project document until they pass validation and are explicitly assembled.

---

## Detailed Implementation Plan

See `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-detailed-plan.md` for the expanded technical plan, and use the companion design, API, UX, evaluation, and implementation docs for exact schemas and execution breakdown.
