# Autonomous Campaign Generation Implementation Plan

> **Execution Plan:** This document converts the autonomous-generation planning set into an implementation sequence with dependencies, file targets, and validation steps.

**Depends On:**
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-design.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-api.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-ux.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-evaluation.md`

---

## Implementation Strategy

Build the system in thin vertical slices, starting with durable run infrastructure and one-shot scale. Do not begin by extending the current wizard into a large synchronous generator.

---

## Phase 1: Shared Types And Prisma Schema

**Goal:** Establish the generation domain in code.

### Tasks

1. Add shared types for runs, artifacts, evaluations, canon entities, and manifests.
2. Extend Prisma schema with generation-domain models.
3. Generate and validate Prisma client.
4. Add service stubs for run, task, artifact, canon, evaluation, and assembly domains.

### Target Files

- `shared/src/types/generation-run.ts`
- `shared/src/types/generated-artifact.ts`
- `shared/src/types/campaign-bible.ts`
- `shared/src/types/artifact-evaluation.ts`
- `shared/src/types/canon-entity.ts`
- `shared/src/types/assembly-manifest.ts`
- `server/prisma/schema.prisma`
- `server/src/services/generation-run.service.ts`
- `server/src/services/generation-task.service.ts`
- `server/src/services/generation-artifact.service.ts`

### Validation

- Prisma migration succeeds.
- shared and server typecheck passes.
- basic CRUD tests for run creation and retrieval exist.

---

## Phase 2: Run API And Listing

**Goal:** Expose durable generation-run lifecycle endpoints.

### Tasks

1. Add generation-run routes.
2. Implement create, list, detail, pause, resume, and cancel endpoints.
3. Add task and artifact listing endpoints.
4. Add auth and ownership checks.

### Target Files

- `server/src/routes/ai-generation.ts`
- `server/src/index.ts`
- service files created in phase 1
- route tests under `server/src/__tests__/`

### Validation

- authenticated user can create a run
- user cannot access another user’s run
- run status transitions obey allowed lifecycle paths

---

## Phase 3: Worker Orchestration Foundation

**Goal:** Move run execution into BullMQ-backed background jobs.

### Tasks

1. Create queues for planning, artifacts, evaluation, revision, and assembly.
2. Add task dispatching and leasing rules.
3. Add checkpoint persistence.
4. Add a minimal progress stream endpoint backed by run state changes.

### Target Files

- `worker/src/jobs/generation-planner.job.ts`
- `worker/src/jobs/generation-artifact.job.ts`
- `worker/src/jobs/generation-evaluate.job.ts`
- `worker/src/jobs/generation-revise.job.ts`
- `worker/src/jobs/generation-assemble.job.ts`
- worker queue registration files
- `server/src/services/generation-orchestrator.service.ts`

### Validation

- browser disconnect does not stop run
- worker restart can resume from durable state
- retries do not duplicate artifacts

---

## Phase 4: Intake Normalization And Campaign Bible

**Goal:** Create the canon-first planning foundation.

### Tasks

1. Build input normalization for mode, budget, and constraints.
2. Build campaign bible generation service.
3. Normalize campaign bible output into stable schema.
4. Persist campaign bible and link it to the run.

### Target Files

- `server/src/services/ai-generation/normalize-run-input.ts`
- `server/src/services/ai-generation/generate-campaign-bible.ts`
- `server/src/services/ai-generation/campaign-bible-normalizer.ts`
- `server/src/services/generation-canon.service.ts`

### Validation

- one prompt produces a structured bible
- malformed provider output can be normalized or rejected cleanly
- bible is versioned and queryable

---

## Phase 5: Decomposition And Planning Artifacts

**Goal:** Turn the bible into a structured product plan.

### Tasks

1. Generate project profile and page-budget allocation.
2. Generate chapter outline.
3. Generate chapter plans and section specs.
4. Generate appendix plan.

### Target Files

- `server/src/services/ai-generation/generate-chapter-outline.ts`
- `server/src/services/ai-generation/generate-chapter-plan.ts`
- `server/src/services/ai-generation/generate-section-spec.ts`
- `server/src/services/ai-generation/generate-appendix-plan.ts`

### Validation

- a one-shot prompt yields a small, coherent plan
- a campaign prompt yields a larger multi-chapter plan with budgets
- planning artifacts are individually inspectable

---

## Phase 6: Canon Entities And Reference Artifacts

**Goal:** Generate reusable assets before prose.

### Tasks

1. Generate NPC dossiers.
2. Generate location briefs.
3. Generate faction profiles.
4. Generate encounter and item bundles.
5. Extract and persist canon entities plus references.

### Target Files

- `server/src/services/ai-generation/generate-npc-dossier.ts`
- `server/src/services/ai-generation/generate-location-brief.ts`
- `server/src/services/ai-generation/generate-faction-profile.ts`
- `server/src/services/ai-generation/generate-encounter-bundle.ts`
- `server/src/services/ai-generation/generate-item-bundle.ts`

### Validation

- reference artifacts are versioned
- canon entities can be listed and inspected
- artifacts reference entity IDs where relevant

---

## Phase 7: Chapter Draft Generation

**Goal:** Generate prose in bounded slices using canon-backed context.

### Tasks

1. Build context assembly service.
2. Generate section drafts per chapter.
3. Merge section drafts into chapter drafts.
4. Convert chapter drafts to TipTap and persist both markdown and TipTap forms.
5. Index written artifacts for retrieval.

### Target Files

- `server/src/services/generation-context.service.ts`
- `server/src/services/ai-generation/generate-chapter-draft.ts`
- supporting content-indexing files

### Validation

- chapter generation uses canon entities and chapter plan inputs
- each chapter exists as a staged artifact before assembly
- retrieval context can be built from previously completed artifacts

---

## Phase 8: Evaluation And Revision Loop

**Goal:** Enforce quality through explicit reports and bounded repair passes.

### Tasks

1. Implement artifact evaluation service.
2. Implement continuity and publication-fit checks.
3. Implement revise-artifact flow with capped retries.
4. Persist evaluations and revisions.

### Target Files

- `server/src/services/generation-evaluation.service.ts`
- `server/src/services/generation-revision.service.ts`
- `server/src/services/ai-generation/evaluate-artifact.ts`
- `server/src/services/ai-generation/revise-artifact.ts`

### Validation

- failing artifact creates findings and revision task
- repeated failures escalate cleanly
- accepted artifacts become eligible for assembly

---

## Phase 9: Assembly And Preflight

**Goal:** Convert accepted artifacts into final project documents.

### Tasks

1. Implement assembly manifest generation.
2. Assemble one or more TipTap documents.
3. Add preflight checks for size and completeness.
4. Write assembled output back to the project document model.

### Target Files

- `server/src/services/generation-assembly.service.ts`
- `server/src/services/ai-generation/assemble-project-documents.ts`

### Validation

- assembled documents preserve expected order
- targeted regeneration can replace a chapter without rebuilding unrelated artifacts
- preflight blocks invalid assembly

---

## Phase 10: Client Review UX

**Goal:** Expose generation runs and artifacts to the user in a controlled way.

### Tasks

1. Add autonomous generation dialog.
2. Add run panel.
3. Add artifact review UI.
4. Add canon browser.
5. Add assembly review panel.
6. Add store logic for polling or streaming progress.

### Target Files

- `client/src/components/ai/AutonomousGenerationDialog.tsx`
- `client/src/components/ai/GenerationRunPanel.tsx`
- `client/src/components/ai/ArtifactReviewPanel.tsx`
- `client/src/components/ai/CanonBrowser.tsx`
- `client/src/components/ai/AssemblyReviewPanel.tsx`
- `client/src/stores/aiStore.ts` or a dedicated generation store

### Validation

- user can start a run from one prompt
- user can inspect artifacts and findings
- user can pause, cancel, resume, and regenerate artifacts

---

## Rollout Order

1. one-shot only
2. short adventure modules
3. medium campaign runs
4. long campaign and sourcebook-scale runs

Do not enable larger modes until smaller modes are stable under evaluation and cost constraints.

---

## Test Plan

### Unit Tests

- schema validation
- run status transitions
- task dependency logic
- canon normalization
- evaluation scoring
- assembly manifest generation

### Integration Tests

- create run and progress through stages
- pause and resume run
- regenerate artifact
- assemble documents
- recover after worker restart

### E2E Tests

- start one-shot run from UI
- inspect artifact findings
- assemble final document

---

## Recommended First Vertical Slice

Implement only enough to support:
- one-shot mode
- one prompt
- campaign bible
- chapter decomposition
- NPC and encounter artifacts
- chapter drafts
- evaluation and one repair pass
- assembly into one document

That slice proves the architecture without overcommitting to long-campaign complexity too early.
