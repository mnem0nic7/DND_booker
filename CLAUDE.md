# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DND Booker is a D&D content creation tool — a rich editor for campaigns, one-shots, supplements, and sourcebooks with AI-assisted writing, PDF/EPUB export, and 22+ custom block types (stat blocks, read-aloud boxes, NPC profiles, etc.).

## Architecture

NPM workspaces monorepo with six packages:

- **`client/`** — React 19 + Vite 6 + TipTap v3 editor + Tailwind CSS 4 + Zustand 5. Dev server on `:3000`, proxies `/api` to `:4000`.
- **`server/`** — Express 4.21 + Prisma 6 + Vercel AI SDK. JWT auth, AES-256-GCM encrypted API keys, rate limiting. Runs on `:4000`.
- **`worker/`** — BullMQ job processor for export and long-running generation/agent orchestration. Uses Typst + Playwright Core, writes durable artifacts to GCS in production, and now runs generation/agent flows as persisted step graphs mirrored into each run's `graphStateJson`.
- **`shared/`** — Shared types, Zod contracts, publication-document schemas, and route metadata. Imported as `@dnd-booker/shared`.
- **`text-layout/`** — Local layout engine and rendering helpers.
- **`sdk/`** — Generated `api/v1` OpenAPI spec and typed client built from the shared route catalog.

```
Client (:3000) → API proxy → Server (:4000) → PostgreSQL + Redis + GCS
                                    ↓ BullMQ
                           Worker service (export + orchestration)
```

## Common Commands

```bash
# Dev servers (run from root)
npm run dev --workspace=server     # Express with tsx watch
npm run dev --workspace=client     # Vite dev server
npm run dev --workspace=worker     # Export worker

# Tests
npm run test:unit --workspace=client                      # Client unit tests
npm test --workspace=server                               # All server tests
npm run test:server:local -- documents.v1.test.ts         # Server integration test with Cloud SQL Proxy + local Redis
cd server && npm test -- src/__tests__/auth.test.ts       # Single server test file

# Database
DATABASE_URL="..." npx prisma generate --schema=server/prisma/schema.prisma
npx prisma migrate dev --name <name> --schema=server/prisma/schema.prisma
npx prisma db seed                   # Creates starter templates
npx prisma studio --schema=server/prisma/schema.prisma

# Type checking
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
npm run typecheck --workspace=shared

# Build
npm run build --workspace=client   # Vite production build
npm run build --workspace=server   # tsc to dist/
```

## Key Patterns

### Server routing
Routes export named routers (`authRoutes`, `aiSettingsRoutes`, `aiChatRoutes`, etc.) mounted in `server/src/index.ts`. AI routes split into four routers: settings, generate, chat, wizard.

The `api/v1` contract validates transport DTOs, not raw Prisma records. If a route parses against a Zod schema with ISO timestamp strings, normalize Prisma `Date` fields before schema validation instead of feeding database rows directly into the response schema. Also keep list routes on their true summary schemas; validating summary payloads against full detail shapes will fail in production even when the underlying data is correct.

Project lifecycle now has a first-class `api/v1` surface (`/api/v1/projects`). New runtime work should use the generated SDK for project list/create/get/update/delete instead of adding more calls against the legacy `/api/projects` routes.
Project aggregate content saves also go through `PATCH /api/v1/projects/:projectId`, and manual document layout saves go through `PATCH /api/v1/projects/:projectId/documents/:docId/layout`. Do not add new runtime writes against the legacy `/api/projects/:id/content` or `/api/projects/:projectId/documents/:docId/layout` paths.
`api/v1` document snapshots now carry `layoutPlan` alongside canonical/editor/Typst fields. Client document loads should consume that v1 snapshot rather than stitching layout data from legacy document routes.
Active client AI/chat/wizard traffic should use `/api/v1/ai/*` and `/api/v1/projects/:projectId/ai/*`. Keep the legacy `/api/ai/*` and `/api/projects/:projectId/ai/*` mounts compatibility-only.
Active template and asset traffic should use `/api/v1/templates`, `/api/v1/projects/:projectId/assets`, and `/api/v1/assets/:id`. Keep the legacy template and asset mounts compatibility-only.

### SSE streaming
Server uses `res.write()` chunks. Chat streams plain text; wizard streams newline-delimited JSON events. Client uses raw `fetch()` + `ReadableStream` reader (not EventSource) to support POST with body.

### AI control blocks
AI responses contain fenced JSON blocks (`_wizardGenerate`, `_memoryUpdate`, `_planUpdate`, `_remember`) that are extracted post-stream by `processAssistantResponse()` in `ai-planner.service.ts`, then stripped from displayed text.

### AI three-layer memory
Transcript (chat messages) → working memory (rolling summary) → long-term memory (persistent facts). Dual-scope: project-scoped facts + global user preferences (`AiMemoryItem.projectId = null` for global).

### State management
Zustand stores in `client/src/stores/`. The `aiStore.ts` is the largest, combining settings, chat streaming, wizard progress, and planning state. Document saves are debounced (1s timeout) with retry (3 attempts, exponential backoff) and localStorage backup on failure. `SaveError` type categorizes errors as `network` or `server`.

### TipTap editor
Custom D&D block types each have an Extension (`.ts`) and a View (`.tsx`) in `client/src/components/blocks/`. Content stored as TipTap JSON in the `Document.content` column. The Toolbar subscribes to editor `transaction` events via `useEffect`/`useState` to reactively update active formatting states (bold, italic, headings, etc.).

### Export/layout heuristics
Paged export TOC entries should use rendered page-model data when available so chapter headers and headings show concrete page numbers instead of placeholder dashes.

Short lead-label paragraphs that end with `:` should stay attached to the following utility block or list to avoid page-bottom orphans during layout planning.

Random tables with 8+ entries are treated as wide in layout planning, but export splitting should stay conservative: keep 8-10 entry tables intact and only split once tables grow beyond that range.

When reapplying accepted art placements after document rebuilds, do not trust stored node indices alone. Resolve against the rebuilt document by block type, subject label, empty-image preference, and proximity.

Any server-side `ProjectDocument` mutation that changes document body content should update `content`, `canonicalDocJson`, `editorProjectionJson`, and `typstSource` together. Prefer `buildResolvedPublicationDocumentWriteData(...)` in `server/src/services/document-publication.service.ts` instead of hand-written `projectDocument.update()` payloads.
After any `ProjectDocument` mutation, rebuild `Project.content` from ordered project documents. `Project.content` is now a compatibility cache, not an authoritative source.

PDF export now keeps the HTML/Playwright measurement pass for preflight and review, but the final production PDF render is Typst-based. Typst workspaces must stage referenced `uploads/...` assets explicitly because production uploads live in GCS, not a shared local disk.

### Persisted run graphs
Generation runs and agent runs now checkpoint the current graph node into `graphStateJson.runtime`. BullMQ retries should resume from that node instead of replaying the whole orchestration function.

Generation pause/resume is now checkpoint-gated: a paused run can only be resumed after the worker has acknowledged the pause and written `runtime.interrupted.kind = "paused"`. Agent runs still pause cooperatively in-process and resume without requeueing.

Approval and review gates persist under `graphStateJson.interrupts`. The v1 run APIs expose project-level and run-level interrupt lists plus resolve endpoints, and the client run panels now block manual resume while pending interrupts remain.

The graph runtime now emits real approval gates:
- generation pauses at a publication-review gate before final art/layout passes
- persistent editor agent runs pause at an approval gate before applying the next planned mutation
- approving a gate auto-resumes the run
- requesting edits keeps the run paused so manual document changes can happen before a later resume
- rejecting a gate cancels the run
- the generation status machine must continue to allow `assembling -> paused` and `assembling -> cancelled`, otherwise publication-review gates spin with a pending interrupt instead of actually yielding control

For generation nodes that own a fixed `version=1` durable row, retries must reuse that row instead of inserting again. Intake, bible, outline, front matter, chapter plan, chapter draft, and assembly now treat their fixed artifact or manifest/document records as replay boundaries.

Assembly is replay-safe by upserting `ProjectDocument` rows on `(projectId, slug)` and reusing the run's `AssemblyManifest` v1 record. Do not reintroduce blanket `deleteMany({ projectId })` behavior for document rebuilds.

Agent checkpoint restore now carries canonical publication fields (`canonicalDocJson`, `editorProjectionJson`, `typstSource`, and their versions) alongside document `content`. Restores should bring publication snapshots back exactly, not rebuild them from stale legacy fields later.

### Authentication
JWT access token (15min) + refresh token (7d, httpOnly cookie). Token version incremented on logout. Client axios interceptor auto-refreshes on 401.

Registration is invite-only in production. New signups require an active row in `registration_invites`; manage that table with `npm run invites --workspace=server -- <list|add|revoke> ...`.

### Encryption
User API keys encrypted with AES-256-GCM. IV + auth tag stored separately. Requires `AI_KEY_ENCRYPTION_SECRET` env var (64 hex chars).

### Document sidebar
DocumentList supports drag-reorder, inline rename (double-click), and two-click delete confirmation (first click shows "Delete?", 3s auto-reset). Truncated names show native tooltip via `title` attribute.

### Properties panel
PropertiesPanel shows document stats and a Document Outline that includes both H1-H3 headings and D&D blocks. Clicking an outline item scrolls to that position in the editor.

## Deployment

Docker Compose runs `postgres`, `redis`, `server`, `worker`, and `client`. Production Cloud Run is split into a web service (`client + server + cloudsql-proxy`) and a worker service (`worker + cloudsql-proxy`).
The worker service runs a periodic runtime audit for stale queued runs, stale queued exports, stale BullMQ queue backlog, and stale pending interrupts. Audit violations log as `OPS_AUDIT_VIOLATION`; install Cloud Monitoring policies against that signal with `npm run monitor:cloudrun:install`.

Rebuild and restart the local services that match the changed packages:

- `client/` only: `docker compose build client && docker compose up -d client`
- `server/` only: `docker compose build server && docker compose up -d server`
- `worker/` only: `docker compose build worker && docker compose up -d worker`
- `shared/` or cross-package changes: `docker compose build server worker client && docker compose up -d server worker client`

Ship flow for requested production updates: validate the touched paths, commit, push, and redeploy the affected services.

## Default Finish Flow

Unless the user explicitly says not to, treat this as the default after every code change:

1. Inspect the changed paths and sanity-check the diff.
2. Run the repo verification flow:
   - `npm run verify:ship` for the normal shippable path.
   - `npm run verify` is the lighter build-only pass when you explicitly do not need the full ship checks.
   - If cloud-backed server integration is unavailable, record the exact blocker instead of silently skipping it.
   - `verify:ship` now includes auth, AI, asset, template, document, project, run, agent restore, and generation-route coverage through the local Cloud SQL Proxy + Redis harness; keep new `api/v1` route regressions in that path when they touch transport serialization or run orchestration APIs.
3. Update repo memory and docs when behavior, workflow, deployment steps, or architecture changed.
   - Memory: this file and any other standing repo guidance.
   - Docs: `README.md`, `deploy/cloudrun/README.md`, `docs/runbooks/cloudrun-web-worker.md`, or the closest feature/runbook doc.
4. Review `git status`, commit the intended changes, and push the current branch.
5. Redeploy production with `npm run deploy:cloudrun` unless the user asked to skip deploys.
   - Set `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`, and optionally `SMOKE_TEST_GENERATION_PROMPT` so the redeploy script also runs the authenticated `api/v1` acceptance smoke automatically.
   - `npm run deploy:cloudrun` now builds once, deploys the web service, deploys the worker service with the resolved web URL injected into `SERVER_BASE_URL`, checks worker readiness, and then runs the acceptance smoke even for worker-only deploys.
   - The production smoke now creates a temp project, drives a generation run through publication review, resumes it, exports a PDF, validates the download, and cleans up the temp project.
   - Manage launch alerts with `npm run monitor:cloudrun:install` and synthetic validation with `npm run monitor:cloudrun:validate`.

Do not stop after code edits if the task implies shipping. Verification, docs, commit, push, and redeploy are part of the normal completion path.

Cloud Run image builds install root NPM workspaces. If you add or rename a workspace dependency used by a runtime package, make sure the relevant Dockerfiles copy that workspace's `package.json` before `npm ci` and its source after.

## Environment

Single `.env` file at project root (not in `server/`). Required vars:
- `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `AI_KEY_ENCRYPTION_SECRET` (generate: `openssl rand -hex 32`)

Docker Compose maps PostgreSQL to `:5433` and Redis to `:6380` on host.

## Agent And Skill Docs

- `docs/agents/` documents the current product agent catalog, including the Autonomous Creative Director and specialist mutators.
- `docs/skills/` documents repo-specific execution skills for Pretext regression work, layout triage, safe document mutation, and agent-run operations.

## Style Conventions

- Purple accent color system (`#7c3aed` / `purple-600`)
- Tailwind CSS utility classes, no CSS modules
- `transition-colors` on interactive elements
- Custom scrollbar styling
- No ESLint/Prettier configured — rely on TypeScript strict mode
