# CLAUDE.md

This file provides standing engineering memory for agents working in this repository.

## Start Here

- Contributor architecture map: `docs/architecture/current-state.md`
- Product agent catalog: `docs/agents/README.md`
- Repo-specific execution guides: `docs/skills/README.md`
- Cloud Run deploy docs: `deploy/cloudrun/README.md`
- Production runbook: `docs/runbooks/cloudrun-web-worker.md`

## Project Overview

DND Booker is a D&D publishing tool with a live paginated TipTap editor, publication-document persistence, AI chat/generation flows, autonomous generation and agent runs, and worker-backed export/orchestration.

## Monorepo Map

- `client/` - React 19 + Vite 6 + TipTap v3 + Zustand 5. The editor, AI panels, and run dashboards live here.
- `server/` - Express 4.21 + Prisma 6 + Vercel AI SDK. Owns auth, `api/v1`, AI routes, project/document authority, and run creation.
- `worker/` - BullMQ worker for export, generation, agent, and cleanup queues. Uses Typst + Playwright Core.
- `shared/` - Shared Zod contracts, publication-document schemas, layout runtime types, generation/agent types, and route metadata.
- `sdk/` - Generated typed client for the `api/v1` surface.
- `text-layout/` - Local layout engine and helpers used by preview/export paths.

```text
Client (:3000) -> Server (:4000) -> PostgreSQL + Redis
                              -> BullMQ -> Worker
                              -> GCS/local object storage
```

## Common Commands

```bash
# Dev servers
npm run dev --workspace=server
npm run dev --workspace=client
npm run dev --workspace=worker

# Verification
npm run verify
npm run verify:ship

# Focused tests
npm run test:unit --workspace=client
npm test --workspace=server
npm run test --workspace=worker
npm run test:server:local -- documents.v1.test.ts

# Database / templates
cd server && npx prisma migrate dev --name <name>
cd server && npx prisma db seed

# Invite management
npm run invites --workspace=server -- list
npm run invites --workspace=server -- add invited@example.com "note"
npm run invites --workspace=server -- revoke invited@example.com
```

## Core Runtime Guidance

### API And SDK

- Product traffic belongs on `/api/v1/*`.
- Keep `/api/health` and `/api/v1/health` for probes; do not reintroduce legacy product `/api/*` routes.
- `server/src/index.ts` is the mount graph for v1 routers plus uploads.
- The canonical transport contract lives in `shared/src/api/v1.ts`.
- If you change transport shapes or route metadata, regenerate the SDK/spec via `npm run verify` or `npm run generate:sdk`.
- Normalize Prisma `Date` values to ISO strings before parsing against response Zod schemas.
- Use summary schemas for list routes and detail schemas for detail routes. Do not validate summary payloads against detail shapes.

### Client State Ownership

- `client/src/lib/api.ts` sets up the Axios instance, bearer token handling, refresh retry, and generated `v1Client`.
- `authStore` owns session state and refresh.
- `projectStore` owns project list/load state, document list/load state, and debounced save/retry behavior.
- `themeStore` owns active theme normalization. Persisted `dmguild` settings are normalized to active `gilded-folio`.
- `aiStore` owns AI settings, chat streaming, wizard state, planning state, and image generation.
- `generationStore` owns generation run state, SSE subscription, artifacts, canon, evaluations, assembly, and interrupt resolution.
- `agentStore` owns agent run state, SSE subscription, checkpoints, actions, restore, and interrupt resolution.
- `improvementLoopStore` owns workspace-wide AI-team recent history, selected-run detail, SSE subscription for the selected active run, loop artifacts, and project GitHub repo binding state.

### Publication Documents Are The Source Of Truth

- `ProjectDocument` is the authoritative publication unit.
- `Project.content` is a compatibility cache rebuilt from ordered project documents. Do not treat it as the primary source of truth.
- Project creation and template bootstrap flow through `server/src/services/project-document-bootstrap.service.ts`.
- Document authority lives in `server/src/services/document-publication.service.ts`.
- Aggregate project saves still use `PATCH /api/v1/projects/:projectId`, but document-aware writes use:
  - `PATCH /api/v1/projects/:projectId/documents/:docId`
  - `PATCH /api/v1/projects/:projectId/documents/:docId/layout`
- Any server-side `ProjectDocument` body mutation should keep the publication bundle in sync:
  - `content`
  - `canonicalDocJson`
  - `editorProjectionJson`
  - `typstSource`
  - `layoutSnapshotJson`
  - `layoutEngineVersion`
  - `layoutSnapshotUpdatedAt`
  - version fields
- Prefer `buildResolvedPublicationDocumentWriteData(...)` over hand-written `projectDocument.update()` payloads.
- After document mutations, rebuild the aggregate project content cache rather than patching `Project.content` directly.

### Editor / Layout Snapshot Parity

- The visible paginated TipTap surface is the real editor. Do not reintroduce a hidden editor plus mirrored HTML preview split.
- Saved `layoutSnapshotJson` for `standard_pdf` is the reopen/export parity contract.
- `client/src/components/editor/EditorLayout.tsx` hydrates from the saved snapshot and republishes refreshed snapshots through normal document saves.
- `client/src/lib/useMeasuredLayoutDocument.ts` and `shared/src/layout-runtime-v2.ts` must stay aligned with worker export pagination.
- `print_pdf` may compute a format-specific snapshot in memory, but it must not overwrite the persisted `standard_pdf` snapshot slot.
- Preserve normal text caret placement inside prose blocks. Do not force top-level `NodeSelection` for ordinary text clicks.
- Manual page breaks in the live parity editor should consume the remaining page height. Do not restore the old compact near-blank separator behavior.
- TOC page numbers should come from rendered page-model data when it is available, not placeholder values.
- Short lead-label paragraphs ending in `:` should stay attached to the following utility block or list to avoid page-bottom orphans.
- Random tables with 8-10 entries should stay intact; only split once they grow beyond that range.
- When reapplying accepted art placements after document rebuilds, do not trust stored node indices alone. Resolve by block type, subject label, empty-image preference, and proximity.
- Preview and export should share the same flow classification from `shared/src/layout-plan.ts`. Do not revive separate side/bottom heuristics or treat `layoutPlacementHint: side_panel|bottom_panel` as the runtime source of truth for wrap-eligible text inserts.
- Keep page metrics and box model aligned across client CSS, shared layout math, and worker HTML assembly or WYSIWYG parity will drift.

### AI Chat, Memory, And Planning

- `server/src/routes/ai.ts` contains four router groups:
  - settings
  - generate
  - chat
  - wizard
- Project-scoped AI chat/state traffic lives under `/api/v1/projects/:projectId/ai/*`.
- Planning state is layered:
  - transcript in `AiChatMessage`
  - rolling working memory in `AiWorkingMemory`
  - long-term memory facts in `AiMemoryItem`
  - task plan in `AiTaskPlan`
- `server/src/services/ai-memory.service.ts` owns CRUD for working memory, long-term memory, and task plans.
- `server/src/services/ai-planner.service.ts` builds planning context and applies control-block updates.
- Chat/wizard streaming uses raw `fetch()` + `ReadableStream` readers on the client rather than `EventSource`, because the runtime needs POST bodies and non-SSE plain-text streams.

### Persisted Generation And Agent Runs

- Generation and agent runs checkpoint their active graph node into `graphStateJson.runtime`.
- BullMQ retries should resume from the persisted node, not replay the orchestration function from the beginning.
- Durable approval/edit/reject gates persist as interrupts and are exposed through the v1 run APIs.
- Generation pause/resume is checkpoint-gated: a paused generation run can only resume after the worker has written `runtime.interrupted.kind = "paused"`.
- Agent runs pause cooperatively and resume without requeueing.
- Run APIs live in `server/src/routes/v1/runs.ts`.
- Worker orchestration entrypoints live in:
  - `worker/src/jobs/generation-orchestrator.job.ts`
  - `worker/src/jobs/agent-orchestrator.job.ts`
  - `worker/src/graph/persisted-graph.ts`
- Generation detail surfaces include tasks, artifacts, canon entities, evaluations, and assembly manifests.
- Agent detail surfaces include checkpoints, action logs, restore, and interrupts.
- Fixed-key durable artifacts and manifests are replay boundaries. Reuse them on retry instead of inserting duplicate rows.
- Assembly should stay replay-safe by upserting `ProjectDocument` rows on `(projectId, slug)` rather than doing blanket `deleteMany({ projectId })` rebuilds.
- Agent checkpoint restore must carry canonical publication fields alongside document content so restored documents come back exactly, not via stale rebuilds.
- Model selection for generation stages should resolve through `server/src/services/llm/router.ts`, not by blindly inheriting the user's chat model across the whole worker run.
- Quick-mode Google runs intentionally downgrade the heavier structured stages (`agent.bible`, `agent.outline`, `agent.canon`, `agent.chapter_draft`, `agent.layout`) to `gemini-2.5-flash`.
- Core generation stages are expected to fail and retry through `withCoreStageTimeout(...)` rather than hang indefinitely inside provider calls.

### Improvement Loop Runtime

- Improvement loops are a separate top-level runtime layered above generation and agent runs.
- `/ai-team` is the supported dashboard-first control surface. It can launch runs, monitor all-project recent history, inspect selected-run artifacts, and compare against the previous run for the same project without entering `/projects/:id`.
- The loop stages are:
  - `bootstrapping_project`
  - `creator`
  - `designer`
  - `editor`
  - `engineering`
- The runtime persists child-run lineage (`linkedGenerationRunId`, `linkedAgentRunId`) plus loop-owned artifacts and engineering apply metadata.
- The current v1 engineering stage is GitHub-only and cloud-safe: it reads and writes through the GitHub API, never by mutating the app server filesystem.
- Safe auto-apply in v1 is limited to the bound repo allowlist. The default repo-visible apply is a checked-in engineering report under `docs/improvement-loops/<runId>.md` on a dedicated `improvement-loop/<runId>` branch plus a draft PR.
- Improvement-loop routes and repo-binding routes live in `server/src/routes/v1/improvement-loops.ts`.
- The additive workspace history route is `GET /api/v1/improvement-loops/recent`; keep it project-title aware and newest-first so the dashboard can render without extra per-run fetches.
- Worker orchestration lives in `worker/src/jobs/improvement-loop-orchestrator.job.ts`.
- Loop report builders and artifact storage live under `server/src/services/improvement-loop/`.

### Export Pipeline

- Export jobs are created on the server and processed by the worker `export` queue.
- The worker keeps the HTML/Playwright pass for preflight/review and uses Typst for final production PDF rendering.
- Export creation should materialize `ProjectDocument` rows before queueing work.
- Export may refresh stale layout snapshots, but it should persist the corrected document bundle and snapshot first rather than applying export-only structural fixes.
- Typst workspaces must stage referenced `uploads/...` assets because production uploads may live in GCS rather than shared local disk.
- Keep `TYPST_PACKAGE_PATH` pointed at the vendored `worker/assets/typst/packages` root so production exports do not depend on live package fetches.
- Keep Typst keep-together wrappers away from manual `pageBreak` and `columnBreak` nodes or Typst container errors will reappear.
- Normalize empty worker/export error messages before persisting or logging them so production triage does not end up with blank failures.

### Auth And Invites

- Access token: 15 minutes
- Refresh token: 7 days, httpOnly cookie
- Token version increments on logout
- Registration is invite-only in all environments; new signups require an active row in `registration_invites`
- API keys are encrypted with AES-256-GCM and require `AI_KEY_ENCRYPTION_SECRET`

## Deployment And Ops

- Local Docker Compose runs `postgres`, `redis`, `server`, `worker`, and `client`.
- Production Cloud Run is split into:
  - web service: `client + server + cloudsql-proxy`
  - worker service: `worker + cloudsql-proxy`
- Production assets and export artifacts use GCS when `GCS_BUCKET` is configured.
- The worker runs a runtime audit for stale queued runs, stale queued exports, stale BullMQ backlog, and stale pending interrupts. Violations log as `OPS_AUDIT_VIOLATION`.
- BullMQ requires Redis `maxmemory-policy=noeviction`. Use `npm run ops:redis:check` after infra changes or during queue triage.

## Default Finish Flow

Unless the user explicitly asks for something else, treat this as the normal completion path after behavior-changing code work:

1. Inspect the touched paths and sanity-check the diff.
2. Run `npm run verify:ship` for the normal shippable path, or `npm run verify` only when a build-only pass is sufficient.
3. If queue durability or Redis behavior may be affected, run `npm run ops:redis:check`.
4. Update standing memory and the closest user/operator docs when behavior, workflow, deployment, or architecture changed.
5. Review `git status`, commit the intended paths, and push.
6. Redeploy with `npm run deploy:cloudrun` unless the user asked to skip deploys.
7. If improvement-loop or GitHub binding behavior changed and smoke credentials are available, run `npm run smoke:cloudrun:improvement-loop` after the base Cloud Run smoke. That live smoke should now cover both the full creator/designer/editor/engineering pipeline and the workspace-history feed exposed by `/api/v1/improvement-loops/recent`.

If local services or the Cloud SQL proxy-backed integration harness are unavailable, record the exact blocker instead of silently skipping verification.

## UI / Style Notes

- Tailwind utility classes are the norm. No CSS modules.
- Theme styling spans multiple CSS theme files under `client/src/styles/themes/`.
- There is no repo-standard ESLint/Prettier workflow; rely on TypeScript, focused tests, and careful diffs.
