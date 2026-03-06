# Autonomous Campaign Generation UX Plan

> **Planning Only:** This document defines the user-facing flows, states, screens, and interaction rules for autonomous campaign generation.

**Companion Docs:**
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-design.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-api.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-implementation.md`

---

## UX Goals

1. Make autonomous generation feel dependable rather than magical.
2. Keep the initial prompt experience lightweight.
3. Give users visibility into progress, artifacts, and problems.
4. Allow targeted intervention without requiring users to manage internal complexity.
5. Preserve a path for fully autonomous operation while supporting guided review.

---

## Primary User Flows

## Flow 1: Start A Run From A Short Prompt

### Entry Point

The user starts from the project editor or project dashboard and chooses an autonomous generation action.

### UI Surface

`AutonomousGenerationDialog`

### Required Inputs

- prompt text area
- optional mode selector: one-shot, module, campaign, sourcebook
- optional page target
- optional advanced constraints toggle

### Advanced Constraints

- tone
- level range
- setting preference
- include handouts
- include maps
- strict 5e preference
- generation style: autonomous or guided

### UX Rules

1. The default path should require only one prompt.
2. Advanced controls should be collapsed by default.
3. The UI should show an estimated scope summary before submission if possible.
4. The submit action should clearly communicate that this is a background generation run.

---

## Flow 2: Monitor Run Progress

### UI Surface

`GenerationRunPanel`

### Required Sections

- run header
- stage progress summary
- task and artifact counts
- latest warnings or failures
- quick actions: pause, resume, cancel

### Run Header

Should show:
- run title or prompt summary
- mode
- current status
- page target and current estimate
- created time and last updated time

### Progress Summary

Should show:
- current stage
- percentage complete
- stage timeline: planning, assets, prose, evaluation, revision, assembly

### UX Rules

1. The panel should be informative even if the user never opens artifact detail views.
2. It should be obvious whether the run is progressing, paused, blocked, or failed.
3. Warnings should not be hidden in logs; they should be surfaced as readable notices.

---

## Flow 3: Review Artifacts

### UI Surface

`ArtifactReviewPanel`

### Required Capabilities

- filter by artifact type and status
- view artifact content
- inspect evaluations
- compare versions
- accept, reject, regenerate

### Artifact List View

Should support filtering by:
- planning artifacts
- canon artifacts
- written artifacts
- evaluation artifacts
- accepted or failed items

### Artifact Detail View

Should show:
- title and artifact type
- current version
- content preview
- provenance metadata
- linked canon entities
- evaluation score and findings
- history of revisions if any

### UX Rules

1. Review should not require the user to understand internal task graphs.
2. Artifact actions should explain their consequences.
3. Regeneration should support artifact-only and artifact-plus-dependents scopes.

---

## Flow 4: Inspect Canon

### UI Surface

`CanonBrowser`

### Purpose

Allow the user to inspect the campaign bible and canonical entities so continuity is legible.

### Required Sections

- campaign bible overview
- NPC roster
- locations
- factions
- items and treasures
- open plot threads
- timeline

### UX Rules

1. The canon browser should read like a reference index, not raw JSON.
2. The user should be able to see what chapters or artifacts reference a given entity.
3. Continuity warnings should link back to affected entities and artifacts.

---

## Flow 5: Handle Failures And Warnings

### Failure Types To Surface

- task retry in progress
- evaluation failed
- continuity conflict
- budget overrun risk
- assembly blocked
- terminal run failure

### UI Behavior

For each warning or failure, show:
- severity
- short message
- affected artifact or stage
- suggested next action

### UX Rules

1. Avoid raw backend error messages where possible.
2. Keep failure states actionable.
3. A failed artifact should not make the whole run feel opaque; the user should see where the failure occurred.

---

## Flow 6: Assemble Output

### UI Surface

`AssemblyReviewPanel`

### Required Sections

- proposed document list
- chapter and appendix order
- page estimates
- preflight warnings
- final assemble action

### UX Rules

1. The user should understand whether they are producing one document or multiple documents.
2. Assembly should feel like the finalization step, not another opaque backend phase.
3. The assemble button should not appear until minimum acceptance criteria are met.

---

## Flow 7: Post-Assembly Editing And Regeneration

After assembly, the user returns to the normal editor but retains provenance-aware controls.

### Expected UX

- generated sections can be identified
- artifact provenance can be inspected
- targeted regeneration actions remain available
- assembly history remains visible through the run panel

### UX Rules

1. Generated content should not become untraceable after assembly.
2. Editing in the document should not silently break provenance links without warning.
3. If a user edits generated content manually, regeneration actions should warn about possible overwrite behavior.

---

## UI State Model

## Run Panel States

- no runs
- creating run
- queued
- active
- paused
- failed
- completed

## Artifact States In UI

- queued
- generating
- generated
- evaluating
- passed
- failed evaluation
- revising
- accepted
- rejected
- assembled

## Empty States

Required empty states:
- no generation runs yet
- no artifacts in selected filter
- no evaluation findings
- no canon entities found for selected type

---

## Interaction Rules

1. Pause should stop new work dispatch, not discard completed artifacts.
2. Cancel should be destructive only at the run level, not to already-assembled project documents unless explicitly requested.
3. Regenerate should always clarify scope.
4. Accepting an artifact should be reversible until final assembly.
5. Guided mode should insert review checkpoints between major stages.

---

## Accessibility And Scalability Considerations

1. Long artifact lists need filtering and pagination.
2. Progress states should not rely on color alone.
3. Evaluation findings should be readable in both summary and detail form.
4. Large runs need stable navigation between chapters, appendices, and canon entities.

---

## UX Deliverables Before Implementation

1. low-fidelity flow map for the full run journey
2. screen inventory for run creation, monitoring, review, canon, and assembly
3. component responsibility list for store and API integration
4. warning and failure copy guidelines
