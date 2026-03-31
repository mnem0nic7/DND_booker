# Pretext Layout Regression

## Purpose

Use this skill whenever a change touches the Pretext-backed layout path, page metrics, grouped layout units, or manual `pageBreak` handling.

## Trigger Files

- `shared/src/text-layout.ts`
- `shared/src/layout-plan.ts`
- `shared/src/page-metrics.ts`
- `shared/src/renderers/layout-html.ts`
- `client/src/lib/useMeasuredLayoutDocument.ts`
- `worker/src/generators/html-pdf.generator.ts`
- `server/src/services/generation/layout-estimate.service.ts`
- `text-layout/`

## Required Checks

- `npm run typecheck --workspace @dnd-booker/shared`
- `npx tsc --noEmit -p client/tsconfig.json`
- `npx tsc --noEmit -p server/tsconfig.json`
- `npm test --workspace @dnd-booker/server -- src/__tests__/generation/text-layout-engine.unit.test.ts`
- `npm test --workspace @dnd-booker/server -- src/__tests__/generation/layout-estimate.unit.test.ts`
- `npm test --workspace @dnd-booker/worker -- src/__tests__/layout-plan.test.ts`
- `npx tsx -e "import('./worker/src/generators/html-pdf.generator.ts').then(() => console.log('worker-html-pdf-ok'))"`

## What To Verify

- supported grouped units stay on the engine path
- unsupported grouped media stay on explicit fallback
- manual `pageBreak` units create hard boundaries in measured page models
- page metrics still expose synthetic `pageBreak` nodes for AI/layout analysis
- `shadow` telemetry shape stays stable across client, worker, and server

## Deployment Rule

If a change touches `shared/` or text-layout parity behavior, rebuild and restart `server`, `worker`, and `client`.

## Common Failure Modes

- grouped units drop fragments when packet lanes collapse
- page breaks disappear from AI analysis because the page model stopped rendering them
- preview and export page counts drift in `shadow`
- a content fix is attempted for what is actually an engine-support gap
