# Autonomous Campaign Generation Evaluation Framework

> **Planning Only:** This document defines scoring rubrics, pass thresholds, revision triggers, and escalation rules for autonomous generation.

**Companion Docs:**
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-design.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-implementation.md`

---

## Evaluation Goals

1. Ensure generated artifacts are coherent, useful, and publication-oriented.
2. Catch continuity and structural problems before assembly.
3. Keep revision loops bounded and explainable.
4. Support artifact-specific acceptance criteria instead of one generic quality bar.

---

## Evaluation Dimensions

## 1. Structural Completeness

Checks whether the artifact contains all required components for its type.

Examples:
- chapter plan includes goals, beats, page target, required entities
- NPC dossier includes role, motivation, hooks, relationships
- chapter draft includes the intended sections and supporting blocks

## 2. Continuity

Checks whether the artifact aligns with the campaign bible and established canon.

Examples:
- same location remains in the same district or region
- an NPC’s motivation, title, or allegiance does not drift
- previously unresolved plot threads are advanced consistently

## 3. D&D Sanity

Checks whether output is broadly appropriate for D&D 5e use.

Examples:
- encounter difficulty is not wildly mismatched to stated level range
- stat blocks are structurally plausible
- treasure progression is not obviously broken

## 4. Editorial Quality

Checks writing quality and document usability.

Examples:
- readable structure
- reasonable pacing
- limited repetition
- useful DM guidance
- appropriate placement of read-aloud content versus DM-only content

## 5. Publication Fit

Checks whether the artifact fits the intended final product.

Examples:
- chapter size is near budget
- organization maps cleanly into the editor and export pipeline
- no major underfilled or overfilled sections

---

## Score Model

Suggested score range: 0 to 100.

Suggested weighted formula for written artifacts:

`overall = 0.25 * structuralCompleteness + 0.25 * continuity + 0.20 * dndSanity + 0.15 * editorialQuality + 0.15 * publicationFit`

For planning or reference artifacts, weights may vary. Example:
- planning artifacts weight structural completeness and continuity more heavily
- written artifacts weight editorial quality and publication fit more heavily

---

## Artifact-Specific Acceptance Thresholds

## Planning Artifacts

Examples:
- project profile
- campaign bible
- chapter outline
- chapter plan

Suggested pass threshold:
- overall >= 85
- continuity >= 90
- structural completeness >= 90

## Reference Artifacts

Examples:
- NPC dossier
- location brief
- faction profile
- item bundle
- encounter bundle

Suggested pass threshold:
- overall >= 80
- continuity >= 85
- dndSanity >= 75

## Written Artifacts

Examples:
- chapter draft
- appendix draft
- read aloud bundle

Suggested pass threshold:
- overall >= 78
- structural completeness >= 80
- continuity >= 80
- publicationFit >= 75

## Assembly And Preflight Artifacts

Examples:
- assembly manifest
- preflight report

Suggested pass threshold:
- overall >= 90
- structural completeness >= 95
- publicationFit >= 90

---

## Finding Severity Levels

## Critical

Examples:
- canonical contradiction that breaks major plot logic
- required chapter or appendix missing entirely
- invalid structure preventing assembly or export

**Action:** block assembly and create mandatory revision task

## Major

Examples:
- location inconsistency
- chapter substantially over or under budget
- encounter or reward problems likely to harm playability

**Action:** create revision task; assembly blocked until addressed for required artifacts

## Minor

Examples:
- repetitive phrasing
- weak transitions
- sidebar placement issues
- style inconsistency without continuity impact

**Action:** optional revision or batched polish pass

## Informational

Examples:
- optimization opportunities
- suggested enrichment or flavor improvements

**Action:** no automatic block

---

## Revision Policy

## Automatic Revision Limits

Suggested defaults:
- planning artifacts: up to 2 revision passes
- reference artifacts: up to 2 revision passes
- written artifacts: up to 2 revision passes
- assembly artifacts: up to 1 targeted revision pass

## Escalation Rules

Escalate to user review if:
- the same major issue persists after 2 revisions
- a critical continuity conflict repeats
- budget cannot be met without structural change
- the run exceeds configured cost or token budget due to revisions

---

## Evaluation Output Schema

Each evaluation should include:
- artifact ID
- artifact version
- evaluation type
- per-dimension scores
- overall score
- passed boolean
- findings array
- recommended actions array
- evaluator model metadata

Example finding shape:
```json
{
  "severity": "major",
  "code": "continuity.location_conflict",
  "message": "The chapel is placed in the harbor district, conflicting with the campaign bible.",
  "affectedScope": "chapter-2",
  "suggestedFix": "Revise chapter 2 to place the chapel in the hill district."
}
```

---

## Evaluation Timing

Evaluate at these points:
- after campaign bible creation
- after chapter and appendix planning
- after each major reference artifact batch
- after each chapter draft
- after any artifact revision
- before final assembly
- after final assembly as preflight

---

## Acceptance Rules For Assembly

A run may proceed to assembly only if:
- all required planning artifacts are accepted
- all required written artifacts are accepted
- no critical findings remain
- major findings are either resolved or explicitly marked as acceptable by user action in guided mode
- preflight blockers are absent

---

## Evaluation Deliverables Before Implementation

1. finalize artifact-specific thresholds
2. finalize finding codes and severity taxonomy
3. define revision prompt templates by artifact type
4. define user-visible wording for findings in the client
