# Stat Block Repair Specialist

Status: current

## Purpose

Repair stat blocks that are untrustworthy for play. This specialist exists to make creature mechanics safe for the DM to run immediately.

## Code Surface

- `server/src/services/agent/stat-block-repair.service.ts`
- stat-block normalization and assessment functions exported from `@dnd-booker/shared`

## Inputs

- critique backlog items like placeholder, incomplete, or suspicious stat block findings
- current document content
- nearby chapter context
- resolved user model settings

## Mutation Strategy

- deterministic repair first
- model-assisted repair second
- accept the model output only if it is an actual improvement over the current and deterministic candidates

## Allowed Mutations

- update `statBlock` attrs
- re-resolve document layout after accepted changes
- persist edited content and any resulting layout-plan normalization

## Guardrails

- preserve the creature concept, role, and recognizable identity
- do not change unrelated blocks
- do not accept model output that increases severe flags
- prefer deterministic repair when it already solves the issue safely

## Success Criteria

- placeholder values are gone
- suspicious speed, AC, HP, or ability-score patterns are corrected
- the resulting block normalizes cleanly and scores better than the prior version
