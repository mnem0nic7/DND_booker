# Change Completion Workflow

## Purpose

Use this workflow whenever an accepted code change should be carried through to a shippable state.

## Default Flow

1. inspect the touched code paths and confirm the runtime impact
2. run the ship-check path unless the user explicitly narrowed the scope
3. update repo memory and docs when behavior, operations, or workflow expectations changed
4. commit intentionally
5. push the branch
6. redeploy the affected runtime

Do not stop after code edits unless the user explicitly says not to ship.

## Verification Rules

- prefer package-scoped verification over a blind full-repo sweep
- regenerate checked-in SDK or spec output before shipping when route contracts changed
- default to `npm run verify:ship`
- `npm run verify:ship` means:
  - `npm run verify`
  - `npm run test --workspace=worker -- layout-visual-parity.test.ts`
  - `npm run test:unit --workspace=client`
  - `npm run test:server:local -- auth.test.ts ai-routes.test.ts ai-wizard.test.ts assets.test.ts templates.test.ts documents.v1.test.ts projects.v1.test.ts runs.v1.test.ts agent-runs.test.ts src/__tests__/exports.v1.test.ts src/__tests__/legacy-routes.test.ts src/__tests__/generation/canon.test.ts src/__tests__/generation/routes.test.ts`
- when `api/v1` routes validate responses against schemas with ISO timestamps, normalize transport DTOs before schema parsing instead of feeding raw Prisma rows directly into the validator
- keep list endpoints on summary schemas and detail endpoints on detail schemas; summary payloads should never be parsed with full-detail contracts
- when project lifecycle work changes, use `/api/v1/projects` plus the generated SDK; do not reintroduce runtime `/api/*` product routes
- active runtime AI/chat/wizard flows should use `/api/v1/ai/*` and `/api/v1/projects/:projectId/ai/*`
- active runtime template and asset flows should use `/api/v1/templates`, `/api/v1/projects/:projectId/assets`, and `/api/v1/assets/:id`
- keep aggregate project content saves on `PATCH /api/v1/projects/:projectId` and manual layout saves on `PATCH /api/v1/projects/:projectId/documents/:docId/layout`; do not reintroduce runtime writes against the old project/document content endpoints
- if a server-side change mutates `ProjectDocument.content`, keep `canonicalDocJson`, `editorProjectionJson`, `typstSource`, `layoutSnapshotJson`, `layoutEngineVersion`, and `layoutSnapshotUpdatedAt` in sync in the same write; prefer `buildResolvedPublicationDocumentWriteData(...)` over ad hoc update payloads
- after any document mutation, rebuild `Project.content` from ordered `ProjectDocument[]`; it is a compatibility cache, not the source of truth
- AI wizard apply and similar section-assembly flows count as document mutations; they should update `ProjectDocument` rows directly, insert generated content before back matter, and replace untouched template placeholder chapter scaffolds instead of flattening everything back through `Project.content`
- export creation should ensure `ProjectDocument` rows exist before queueing worker jobs; keep `Project.content` fallbacks as defensive compatibility only
- when layout or pagination behavior changes, update the saved `LayoutRuntimeV2` snapshot contract as part of the authoritative publication bundle; editor preview and export preflight should consume the same snapshot instead of inventing separate page models
- when touching flowing text inserts, update the shared flow classification in `shared/src/layout-plan.ts` first and let preview HTML plus Typst export consume that decision; do not fork preview/export placement heuristics
- wrap-eligible text inserts only wrap when prose continues after the insert anchor. If there is no trailing prose, keep the unit grouped but do not reorder content just to force a wrap
- when touching WYSIWYG page layout or preview/export parity, keep client CSS page reserves and page box model aligned with `shared/src/layout-plan.ts` and the worker HTML assembler; mismatched `page-content-height`, footer reserve, `height`, `box-sizing`, or overflow rules create preview-only footer collisions and inter-page leakage that the Typst export path will not reproduce
- the hidden parity measurement host must inherit the same `.ProseMirror` typography context as the visible preview without duplicating editor column-count rules; otherwise paragraph and boxed-callout heights are under-measured and preview pagination clips blocks that export renders correctly
- keep showcase blocks like `magicItem`, `spellCard`, `classFeature`, and `raceBlock` eligible for local utility-packet regrouping with the short section intro immediately before them; if the intro gets left behind as a separate section packet, the preview drifts into sparse checkerboard pages even when export compiles cleanly
- keep the vendored Typst `@preview/wrap-it:0.1.1` package under `worker/assets/typst/packages` and the `worker/assets/typst/lib/flow-wrap.typ` shim in sync; the worker compile path depends on that local package root via `TYPST_PACKAGE_PATH`
- when layout parity coverage changes, keep the worker-side screenshot regression current; `layout-visual-parity.test.ts` is the default guard for preview vs Typst export drift on compact wrap-heavy chapter content
- keep Playwright browser path resolution tolerant of user-local Chrome installs for local worker verification. This repo cannot assume `/usr/bin/chromium` exists on every machine
- keep Typst keep-together renderers from swallowing manual `pageBreak` or `columnBreak` nodes; structural breaks must render at the top level, not inside `#block(...)[...]`, or PDF compilation will fail
- generation nodes that already have strong Zod schemas, like outline generation and canon expansion, should prefer schema-native `generateObject(...)` over `generateText(...)` plus post-parse repair
- generation and agent workers should resolve per-stage models through the routed agent presets instead of using the raw user chat model for every node; this is especially important when users save Google preview models that are acceptable for chat but unreliable for long-running structured orchestration
- when the local server integration test depends on Cloud SQL access, record the exact GCP blocker if it cannot run
- remove accidental compiled artifacts from source directories before commit
- if infrastructure blocks a test or deploy, record the exact blocker
- for BullMQ-backed production reliability, keep Memorystore on `maxmemory-policy=noeviction` and validate with `npm run ops:redis:check` after Redis or network changes
- for Cloud Run launch hardening, keep monitoring install and validation scripts up to date: `npm run monitor:cloudrun:install` and `npm run monitor:cloudrun:validate`
- if worker runtime audit coverage changes, keep the backlog and interrupt semantics reflected in the runbook and worker manifest env defaults

## Production Rule

For Cloud Run, treat changes under `client/`, `server/`, `worker/`, `shared/`, `sdk/`, `deploy/cloudrun/`, and Prisma schema or migration changes as redeploy-triggering by default.

The authenticated Cloud Run smoke should exercise the full acceptance path, not just read-only health checks. The current default is: create temp project -> create generation run -> wait for publication-review interrupt -> approve + resume -> create export -> download PDF -> cleanup temp project.
That smoke should re-authenticate automatically if the generation/export poll outlives the initial access token.
That smoke should run after worker-only deploys too when credentials are available.
