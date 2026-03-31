# Random Table Expansion Specialist

Status: current

## Purpose

Strengthen thin random tables so the entries are runnable at the table instead of flavor-only placeholders.

## Code Surface

- `server/src/services/agent/random-table-expander.service.ts`
- random-table assessment helpers in `@dnd-booker/shared`

## Inputs

- critique backlog items like `EXPORT_THIN_RANDOM_TABLE`
- current document content
- table title and current entries
- resolved user model settings

## Allowed Mutations

- rewrite random table entries while preserving roll ranges
- keep the same table block and title
- persist improved document content

## Guardrails

- preserve the number of entries
- preserve each roll or roll-range exactly
- do not turn the table into a new scene outline or new chapter section
- prefer deterministic strengthening if the model call fails

## Success Criteria

- thin-entry count decreases or stays flat
- entries become concrete clues, dangers, NPC reactions, or actionable discoveries
- the table remains stable enough for existing layout grouping and export logic
