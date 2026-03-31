# Layout Refresh Specialist

Status: current

## Purpose

Refresh layout plans when the export or page-model review says the structure is wrong but the underlying content is still acceptable.

This specialist should change layout only. It should not rewrite prose or mechanics.

## Code Surface

- `server/src/services/agent/layout-refresh.service.ts`
- `server/src/services/layout-plan.service.ts`
- `shared/src/layout-plan.ts`

## Inputs

- `ExportReview`
- target document title or whole-project scope
- existing `layoutPlan`
- review codes such as weak hero placement, underfilled last pages, split scene packets, or unused page regions

## Allowed Mutations

- recompute `layoutPlan` via `recommendLayoutPlan(...)`
- persist the updated plan to project documents
- mark touched documents as `edited`

## Not Allowed

- editing document prose
- changing stat block attrs
- expanding random table entries
- inserting new utility blocks

## Good Targets

- chapter opener placement problems
- underfilled or unbalanced pages
- encounter packet grouping issues
- art or utility blocks that should move between column, full-width, or bottom-panel regions

## Failure Cases

- the review code points to a content problem rather than a layout problem
- the issue is really Pretext parity drift rather than a bad plan
- the document contains unsupported visual blocks whose space usage must stay on fallback measurement
