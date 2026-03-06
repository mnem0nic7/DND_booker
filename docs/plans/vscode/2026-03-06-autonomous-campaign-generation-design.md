# Autonomous Campaign Generation Design

> **Planning Only:** This document defines the target architecture, domain model, state transitions, and system invariants for autonomous campaign generation.

**Companion Docs:**
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-plan.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-detailed-plan.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-api.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-evaluation.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-implementation.md`

---

## Design Goals

1. Support prompt-to-product generation for one-shots through long-form campaigns.
2. Preserve continuity through a canonical campaign bible and normalized entities.
3. Make generation durable, resumable, inspectable, and incrementally regenerable.
4. Separate planning artifacts, content artifacts, evaluation artifacts, and assembled editor documents.
5. Fit within the existing DND Booker architecture: Express, Prisma, BullMQ worker, TipTap JSON.

---

## Domain Model

## Core Aggregates

### `GenerationRun`

The aggregate root for autonomous generation.

**Responsibilities:**
- holds the original prompt and normalized generation configuration
- tracks lifecycle status and stage progress
- acts as the container for tasks, canon, artifacts, and assembly state

**Invariants:**
- a run belongs to exactly one project and one user
- a run has one active status at a time
- a run may have many tasks and artifacts
- a run may have multiple assembly manifests over time, but only one latest accepted manifest

### `CampaignBible`

The canonical source of truth for setting, tone, structure, entities, and unresolved threads.

**Responsibilities:**
- stores world assumptions and narrative constraints
- defines the foundational content contract for all downstream generation
- serves as the primary continuity anchor

**Invariants:**
- a run must have at most one active bible version at a time
- downstream chapter and asset generation must reference a specific bible version
- revising the bible after prose generation may invalidate dependent artifacts

### `GeneratedArtifact`

A versioned piece of staged output.

**Examples:**
- chapter plan
- NPC dossier
- encounter bundle
- chapter draft
- appendix draft
- evaluation report snapshot

**Responsibilities:**
- stores artifact content in structured, markdown, and TipTap forms where appropriate
- preserves provenance and version history
- supports isolated regeneration

**Invariants:**
- every artifact belongs to a run
- every artifact version is immutable once written
- newer versions supersede but do not erase older versions

### `GenerationTask`

A durable unit of work executed by the orchestration layer.

**Responsibilities:**
- represents one planning, generation, evaluation, revision, or assembly action
- records dependency relationships and retries
- persists execution outcomes

**Invariants:**
- a task may not begin until all required dependencies are complete
- a task result must be idempotent under retry
- a failed task may only retry up to its configured limit

### `AssemblyManifest`

The ordered plan for turning staged artifacts into final project documents.

**Responsibilities:**
- defines document boundaries and artifact order
- maps staged content into editor-ready document structures
- preserves provenance for targeted regeneration

**Invariants:**
- a manifest references specific artifact versions
- assembly must be reproducible from the same manifest inputs

---

## Canon Model

## Entity Types

At minimum, the canon layer should support:
- NPC
- Location
- Faction
- Item
- Quest
- VillainPlan
- TimelineEvent
- EncounterTemplate
- LoreTerm

## Entity Structure

Each canon entity should include:
- stable entity ID
- entity type
- canonical name
- aliases
- structured attributes by entity type
- source artifact reference
- relationship list
- confidence or validation metadata

## Relationship Types

Relationships should support:
- belongs_to
- allied_with
- opposed_to
- located_in
- controls
- seeks
- knows
- mentors
- serves_as_boss_of
- appears_in
- resolves_in

## Canon Invariants

1. Canon entities should not be inferred only from prose after the fact when the information can be generated structurally first.
2. Each artifact that introduces or updates canon must declare affected entities.
3. Conflicting entity attributes must create a continuity warning or revision task.
4. Chapter prose should use canon entity IDs where feasible in metadata or indexing, even if user-facing content only shows names.

---

## Artifact Model

## Artifact Classes

### Planning Artifacts

Used to define work before prose exists.

Examples:
- project profile
- campaign bible
- chapter outline
- chapter plan
- section spec
- appendix plan

### Reference Artifacts

Reusable structured assets used by multiple chapters.

Examples:
- NPC dossier
- faction profile
- location brief
- encounter bundle
- item bundle
- monster bundle

### Written Artifacts

Narrative or publication-facing output.

Examples:
- chapter draft
- appendix draft
- sidebar bundle
- read aloud bundle
- handout bundle

### Evaluation Artifacts

Quality-control outputs.

Examples:
- continuity report
- rules sanity report
- completeness report
- page budget report
- preflight report

### Assembly Artifacts

Document composition outputs.

Examples:
- assembly manifest
- assembled document snapshot

## Artifact Lifecycle States

Suggested states:
- `queued`
- `generating`
- `generated`
- `evaluating`
- `passed`
- `failed_evaluation`
- `revising`
- `accepted`
- `rejected`
- `assembled`

**State Rules:**
- `generated` means content exists but is not yet accepted
- `passed` means the latest evaluation passed threshold
- `accepted` means the system or user has approved it for assembly
- `assembled` means the artifact has been incorporated into one or more final documents

---

## Run State Machine

Suggested run states:
- `queued`
- `planning`
- `generating_assets`
- `generating_prose`
- `evaluating`
- `revising`
- `assembling`
- `completed`
- `failed`
- `paused`
- `cancelled`

## State Transition Rules

1. `queued -> planning`
   Trigger: orchestration begins.

2. `planning -> generating_assets`
   Trigger: campaign bible and decomposition artifacts are accepted.

3. `generating_assets -> generating_prose`
   Trigger: required reference artifacts reach accepted state.

4. `generating_prose -> evaluating`
   Trigger: all required written artifacts for the current scope are generated.

5. `evaluating -> revising`
   Trigger: at least one required artifact fails thresholds and still has revision budget.

6. `evaluating -> assembling`
   Trigger: required artifacts pass acceptance rules.

7. `assembling -> completed`
   Trigger: final documents are assembled and preflight passes.

8. any active state -> `paused`
   Trigger: user pauses or system enters controlled hold.

9. any active state -> `cancelled`
   Trigger: explicit user cancellation.

10. any active state -> `failed`
   Trigger: unrecoverable dependency or repeated task failure.

---

## Orchestration Design

## Execution Unit

The execution unit is a `GenerationTask`, not a whole run or chapter.

Examples of task types:
- normalize_input
- generate_campaign_bible
- generate_chapter_outline
- generate_npc_dossier
- generate_location_brief
- generate_chapter_section
- evaluate_artifact
- revise_artifact
- assemble_documents

## Dependency Model

Tasks should form a DAG.

Examples:
- `generate_campaign_bible` depends on `normalize_input`
- `generate_chapter_outline` depends on `generate_campaign_bible`
- `generate_npc_dossier` depends on `generate_campaign_bible`
- `generate_chapter_section` depends on `generate_chapter_plan` and its required reference artifacts
- `assemble_documents` depends on accepted written artifacts and a valid manifest

## Idempotency Requirements

Each task should be keyed by:
- run ID
- task type
- artifact key or scope
- input version signature

Retries must not duplicate artifacts or create conflicting state.

## Checkpointing Rules

Checkpoints should exist after:
- campaign bible generation
- chapter outline completion
- each reference artifact batch
- each chapter draft
- each evaluation wave
- assembly manifest generation
- final assembly

---

## Context Assembly Design

The context passed to a generator should be explicit and bounded.

## Context Layers

### Global Context

Includes:
- normalized run input
- campaign bible summary
- style guide
- product profile and page budgets

### Local Artifact Context

Includes:
- chapter plan or artifact spec
- directly required canon entities
- neighboring summaries where relevant
- unresolved plot threads relevant to this scope

### Evaluation Context

Includes:
- artifact under review
- latest evaluation history
- canon entities and neighboring dependencies if continuity is involved

## Design Rule

No generator should rely on unconstrained chat history as the primary continuity source for long-form generation.

---

## Assembly Design

## Assembly Inputs

Assembly should consume:
- accepted written artifacts
- accepted reference artifacts that must be embedded or appended
- current assembly manifest
- project-level formatting and theme preferences

## Assembly Outputs

Assembly should produce:
- one or more TipTap document trees
- provenance metadata per major inserted section where feasible
- summary of included artifact versions

## Assembly Invariants

1. Assembly is deterministic given the same manifest and artifact versions.
2. Re-assembling should not silently reorder content.
3. A chapter or appendix should be replaceable without reassembling unrelated sections beyond manifest rules.

---

## Failure Design

## Failure Classes

### Recoverable

Examples:
- provider timeout
- malformed but reparable JSON
- failed evaluation with revision budget remaining
- temporary worker interruption

### Escalatable

Examples:
- repeated canon conflicts in the same scope
- repeated artifact evaluation failures
- page budget impossible to meet without structural changes

### Terminal

Examples:
- missing project ownership
- irrecoverable schema mismatch
- corrupted run state that cannot be reconciled automatically

## Failure Handling Rules

1. Recoverable failures create retries or revision tasks.
2. Escalatable failures pause the run for user review or mark it failed with actionable findings.
3. Terminal failures mark the run failed and preserve all diagnostics.

---

## Design Boundaries

## What Belongs In Chat

Chat remains useful for:
- discussing ideas
- launching a generation run
- summarizing run outcomes
- reviewing artifacts conversationally

## What Does Not Belong In Chat

Chat should not be the execution environment for:
- long-running orchestration
- durable task state
- artifact version control
- canonical continuity enforcement
- final assembly logic

---

## Design Deliverables Before Implementation

1. Finalize Prisma entity relationships and cardinality.
2. Finalize artifact taxonomy and state enum values.
3. Finalize task DAG rules and checkpoint policy.
4. Finalize canon entity schemas.
5. Finalize assembly-manifest schema.
6. Finalize evaluation report schema.

These design artifacts should be treated as prerequisites for implementation in `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-implementation.md`.
