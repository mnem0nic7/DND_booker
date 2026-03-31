# Utility Densifier Specialist

Status: current

## Purpose

Convert prose-heavy sections into DM-runnable sections by adding compact utility packets such as read-aloud, summaries, clues, stakes, escalation steps, and fallout.

## Code Surface

- `server/src/services/agent/utility-densifier.service.ts`
- `server/src/services/layout-plan.service.ts`

## Inputs

- critique backlog items like low utility density or incomplete encounter packet coverage
- document title and sample text
- resolved user model settings

## Allowed Mutations

- insert read-aloud boxes
- insert sidebar callouts
- insert bullet or ordered lists
- choose a stable insertion point near the opener of the target section
- re-resolve document layout after insertion

## Guardrails

- preserve the chapter premise
- add runnable support, not a second outline
- avoid duplicate utility packets when a document already has them
- keep new content compact enough to remain layout-friendly

## Success Criteria

- prose-heavy sections gain concrete DM aids
- inserted blocks improve utility density without bloating front matter or creating obvious filler
- layout planning can re-group the new packet blocks naturally
