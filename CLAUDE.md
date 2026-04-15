# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DND Booker is a D&D content creation tool — a rich editor for campaigns, one-shots, supplements, and sourcebooks with AI-assisted writing, PDF/EPUB export, and 22+ custom block types (stat blocks, read-aloud boxes, NPC profiles, etc.).

## Architecture

NPM workspaces monorepo with six packages:

- **`client/`** — React 19 + Vite 6 + TipTap v3 editor + Tailwind CSS 4 + Zustand 5. Dev server on `:3000`, proxies `/api` to `:4000`.
- **`server/`** — Express 4.21 + Prisma 6 + Vercel AI SDK. JWT auth, AES-256-GCM encrypted API keys, rate limiting. Runs on `:4000`.
- **`worker/`** — BullMQ job processor with four job types: `export` (Typst+Playwright PDF), `generation-orchestrator` (autonomous content pipeline), `agent-orchestrator` (persistent editor agent), and `cleanup`. Writes durable artifacts to GCS in production; runs generation/agent flows as persisted step graphs mirrored into each run's `graphStateJson`.
- **`shared/`** — Shared types, Zod contracts, publication-document schemas, and route metadata. Imported as `@dnd-booker/shared`.
- **`text-layout/`** — Local Pretext fork for flagged text measurement. Supports three modes via `TEXT_LAYOUT_ENGINE_MODE`: `legacy` (CSS-only estimate), `shadow` (parallel measurement), `pretext` (full Pretext engine).
- **`sdk/`** — Generated `api/v1` OpenAPI spec and typed TypeScript client built from the shared route catalog. Regenerate with `npm run generate:sdk` whenever `api/v1` route contracts change.

```
Client (:3000) → API proxy → Server (:4000) → PostgreSQL + Redis + GCS
                                    ↓ BullMQ
                           Worker service (export + orchestration)
```

The authenticated dashboard at `/` is the **Forge Console** operator shell, not a passive project grid. It shows an agent roster synthesized from autonomous-run `graphStateJson` signals and uses the `/api/v1/projects/:projectId/console/*` contract for live board and chat.

## Common Commands

Prerequisites: Node.js 20+, PostgreSQL 16, Redis 7.

```bash
# Dev servers (run from root)
npm run dev --workspace=server     # Express with tsx watch
npm run dev --workspace=client     # Vite dev server
npm run dev --workspace=worker     # Export + orchestration worker

# Tests
npm run test:unit --workspace=client                        # Client unit tests
npm test --workspace=server                                 # All server tests
npm run test --workspace=worker -- layout-visual-parity.test.ts  # Single worker test
npm run test:server:local -- documents.v1.test.ts           # Server integration test (needs Cloud SQL Proxy + Redis)
cd server && npm test -- src/__tests__/auth.test.ts         # Single server test file

# SDK / type generation
npm run generate:sdk                  # Regenerate OpenAPI spec + typed client (run after api/v1 route changes)

# Verification
npm run verify                        # Build shared, sdk, server, worker, client (no tests)
npm run verify:ship                   # Full ship check: verify + worker layout regression + client unit + server integration suite

# Database
npx prisma migrate dev --name <name> --schema=server/prisma/schema.prisma
npx prisma db seed                    # Creates starter templates
npx prisma studio --schema=server/prisma/schema.prisma

# Invite management (production registration is invite-only)
npm run invites --workspace=server -- list
npm run invites --workspace=server -- add <email>
npm run invites --workspace=server -- revoke <email>

# Type checking
cd client && npx tsc --noEmit
cd server && npx tsc --noEmit
npm run typecheck --workspace=shared

# Build
npm run build --workspace=client   # Vite production build
npm run build --workspace=server   # tsc to dist/

# Ops
npm run ops:redis:check            # Verify Redis maxmemory-policy=noeviction
npm run monitor:cloudrun:install   # Install Cloud Monitoring alert policies
npm run monitor:cloudrun:validate  # Validate synthetic monitoring
```

## Key Patterns

### Server routing
Routes export named routers (`authRoutes`, `aiSettingsRoutes`, `aiChatRoutes`, etc.) mounted in `server/src/index.ts`. AI routes split into four routers: settings, generate, chat, wizard.

The `api/v1` contract validates transport DTOs, not raw Prisma records. Normalize Prisma `Date` fields before schema validation — do not feed database rows directly into Zod schemas with ISO timestamp strings. Keep list routes on summary schemas and detail routes on detail schemas; they are not interchangeable.

All product traffic goes through `/api/v1/*`. The only legacy survivor is `/api/health` for operational probes.

Route surface by domain:
- Projects: `/api/v1/projects` and `/api/v1/projects/:projectId` (use the generated SDK for CRUD)
- Documents: `/api/v1/projects/:projectId/documents/:docId` (PATCH persists content + snapshot together)
- Layout: `PATCH /api/v1/projects/:projectId/documents/:docId/layout`
- Interview: `/api/v1/projects/:projectId/interview/sessions/*`
- Console: `/api/v1/projects/:projectId/console/*`
- AI: `/api/v1/ai/*` and `/api/v1/projects/:projectId/ai/*`
- Assets/templates: `/api/v1/projects/:projectId/assets`, `/api/v1/assets/:id`, `/api/v1/templates`

### Document mutation
Any server-side `ProjectDocument` mutation that changes document body content must update `content`, `canonicalDocJson`, `editorProjectionJson`, `typstSource`, `layoutSnapshotJson`, `layoutEngineVersion`, and `layoutSnapshotUpdatedAt` together. Use `buildResolvedPublicationDocumentWriteData(...)` in `server/src/services/document-publication.service.ts` instead of hand-writing update payloads.

After any mutation, rebuild `Project.content` from ordered `ProjectDocument[]`. `Project.content` is a compatibility cache, not the source of truth.

Assembly is replay-safe by upserting `ProjectDocument` rows on `(projectId, slug)`. Do not reintroduce `deleteMany({ projectId })` for document rebuilds.

### Layout / export parity
The authoritative publication bundle is `layoutPlan`, `canonicalDocJson`, `editorProjectionJson`, `typstSource`, and the saved `LayoutRuntimeV2` snapshot fields. `layoutSnapshotJson` is the persisted page/fragment contract shared by the editor render path and export preflight; rebuild it through `buildLayoutDocumentV2(...)` when missing or stale.

Current parity goal: exact page count, block order, and column placement between the visible paginated editor and export. When parity regresses, start at `client/src/hooks/usePageAlignment.ts`, `client/src/extensions/SnapshotPagination.ts`, `client/src/components/editor/RenderedDocumentCanvas.tsx`, `client/src/lib/useMeasuredLayoutDocument.ts`, and `worker/src/jobs/export.job.ts`.

Keep Typst keep-together wrappers away from manual `pageBreak` and `columnBreak` nodes — structural breaks inside `#block(...)[...]` cause a Typst compile error.

For deeper layout rules see `docs/skills/change-completion-workflow.md`.

### Autonomous generation pipeline
Generation starts from a **locked interview session** (`interview_brief` artifact must exist) before enqueuing a worker run. The pipeline stages are: interviewer → writer story packet → D&D expert inserts → layout draft + image briefs → critic loop with routed rewrites → final editor → printer/export.

Models resolve per-stage through `server/src/services/llm/router.ts` against `config/agents.yaml`, not from the user's saved chat model. `config/agents.yaml` defines system-managed credential env vars (`SYSTEM_GOOGLE_API_KEY`, etc.) and per-lane model presets (`fast`, `balanced`, `high_quality`). Quick-mode runs downgrade heavy stages (`agent.bible`, `agent.outline`, `agent.canon`, `agent.chapter_draft`, `agent.layout`) to the Flash lane.

Run state tracked in `graphStateJson`: `agentStage`, `criticCycle`, `qualityBudgetLane`, `routedRewriteCounts`, `imageGenerationStatus`, `finalEditorialStatus`.

### Persisted run graphs
Generation and agent runs checkpoint the current node into `graphStateJson.runtime`. BullMQ retries resume from that node, not from cycle 0.

Approval gates persist under `graphStateJson.interrupts`. Gate types: generation pauses at publication-review before final art/layout passes; persistent editor agent pauses before applying planned mutations. Approving auto-resumes; requesting edits keeps the run paused; rejecting cancels. The generation state machine must allow `assembling -> paused` and `assembling -> cancelled`.

`createVersionedArtifact(...)` handles `P2002` collisions by re-reading the latest artifact keyed on `(runId, artifactType, artifactKey)`. All stages that can replay inside the critic/rewrite loop must use it — including `layout_plan`, `art_direction_plan`, and `editor_report`. Never insert a raw `version: 1` artifact for a replayable stage.

All core writer JSON nodes (outline, canon expansion, bible, chapter plan, intake normalization, evaluator) use `generateObjectWithTimeout(...)` with schema-native structured output. Do not reintroduce `generateText(...)` + JSON repair in those paths.

### SSE streaming
Server uses `res.write()` chunks. Chat streams plain text; wizard streams newline-delimited JSON events. Client uses raw `fetch()` + `ReadableStream` reader (not EventSource) to support POST with body.

### AI control blocks
AI responses contain fenced JSON blocks (`_wizardGenerate`, `_memoryUpdate`, `_planUpdate`, `_remember`) extracted post-stream by `processAssistantResponse()` in `ai-planner.service.ts`, then stripped from displayed text.

### AI three-layer memory
Transcript (chat messages) → working memory (rolling summary) → long-term memory (persistent facts). Dual-scope: project-scoped facts + global user preferences (`AiMemoryItem.projectId = null` for global).

### State management
Zustand stores in `client/src/stores/`. The `aiStore.ts` is the largest, combining settings, chat streaming, wizard progress, and planning state. Document saves are debounced (1s timeout) with retry (3 attempts, exponential backoff) and localStorage backup on failure. `SaveError` type categorizes errors as `network` or `server`.

### TipTap editor
Custom D&D block types each have an Extension (`.ts`) and a View (`.tsx`) in `client/src/components/blocks/`. Content stored as TipTap JSON in the `Document.content` column. The Toolbar subscribes to editor `transaction` events via `useEffect`/`useState` to reactively update active formatting states.

### Authentication
JWT access token (15min) + refresh token (7d, httpOnly cookie). Token version incremented on logout. Client axios interceptor auto-refreshes on 401.

Registration is invite-only in production (see invite management commands above).

### Encryption
User API keys encrypted with AES-256-GCM. IV + auth tag stored separately. Requires `AI_KEY_ENCRYPTION_SECRET` env var (64 hex chars).

### Document sidebar
DocumentList supports drag-reorder, inline rename (double-click), and two-click delete confirmation (first click shows "Delete?", 3s auto-reset). Truncated names show native tooltip via `title` attribute.

### Properties panel
PropertiesPanel shows document stats and a Document Outline that includes both H1-H3 headings and D&D blocks. Clicking an outline item scrolls to that position in the editor.

## Deployment

Docker Compose runs `postgres`, `redis`, `server`, `worker`, and `client`. PostgreSQL maps to `:5433` and Redis to `:6380` on host. Production Cloud Run is split into a web service (`client + server + cloudsql-proxy`) and a worker service (`worker + cloudsql-proxy`).

The worker service runs a periodic runtime audit for stale queued runs/exports, stale BullMQ backlog, and stale pending interrupts. Audit violations log as `OPS_AUDIT_VIOLATION`.

Production Redis must stay on `maxmemory-policy=noeviction` — BullMQ is not safe on evicting policies.

Rebuild and restart the local services that match the changed packages:

- `client/` only: `docker compose build client && docker compose up -d client`
- `server/` only: `docker compose build server && docker compose up -d server`
- `worker/` only: `docker compose build worker && docker compose up -d worker`
- `shared/` or cross-package changes: `docker compose build server worker client && docker compose up -d server worker client`

## Default Finish Flow

Unless the user explicitly says not to, treat this as the default after every code change:

1. Inspect the changed paths and sanity-check the diff.
2. Run the repo verification flow:
   - `npm run verify:ship` for the normal shippable path.
   - `npm run verify` is the lighter build-only pass when you explicitly do not need the full ship checks.
   - If cloud-backed server integration is unavailable, record the exact blocker instead of silently skipping it.
   - `verify:ship` covers worker layout regression, client unit tests, and the full server integration suite (auth, AI, wizard apply, assets, templates, documents, v1 export, legacy-compat headers, agentic artifacts, intake, bible, chapter plan, golden prompts, canon expansion, evaluator, projects, runs, interview, agent restore, generation routes, console). Keep new `api/v1` regressions in this path when they touch transport serialization or run orchestration.
   - For queue-durability work, add `npm run ops:redis:check` to the ship pass.
3. Update repo memory and docs when behavior, workflow, deployment steps, or architecture changed.
   - Memory: this file and any other standing repo guidance.
   - Docs: `README.md`, `deploy/cloudrun/README.md`, `docs/runbooks/cloudrun-web-worker.md`, or the closest feature/runbook doc.
4. Review `git status`, commit the intended changes, and push the current branch.
5. Redeploy production with `npm run deploy:cloudrun` unless the user asked to skip deploys.
   - Set `SMOKE_TEST_EMAIL`, `SMOKE_TEST_PASSWORD`, and optionally `SMOKE_TEST_GENERATION_PROMPT` for the acceptance smoke.
   - `npm run deploy:cloudrun` builds once, deploys web + worker, checks worker readiness, then runs the smoke even for worker-only deploys.
   - The smoke exercises the full path: create temp project → create generation run → drive through publication-review interrupt → approve + resume → export PDF → download → cleanup.
   - `scripts/smoke-cloudrun-v1.mjs` re-authenticates automatically if the poll outlives the 15-minute access token.

Do not stop after code edits if the task implies shipping. Verification, docs, commit, push, and redeploy are part of the normal completion path.

Cloud Run image builds install root NPM workspaces. If you add or rename a workspace dependency used by a runtime package, make sure the relevant Dockerfiles copy that workspace's `package.json` before `npm ci` and its source after.

## Environment

Single `.env` file at project root (not in `server/`). Required vars:
- `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- `AI_KEY_ENCRYPTION_SECRET` (generate: `openssl rand -hex 32`)

Production-only additions:
- `SYSTEM_GOOGLE_API_KEY` (and/or `SYSTEM_OPENAI_API_KEY`, `SYSTEM_ANTHROPIC_API_KEY`) — system-managed credentials for autonomous runs; required on both web and worker Cloud Run services
- `GCS_BUCKET` — artifact storage for worker exports

Optional:
- `TEXT_LAYOUT_ENGINE_MODE` — server/worker layout mode: `legacy` | `shadow` | `pretext`
- `VITE_TEXT_LAYOUT_ENGINE_MODE` — client preview layout mode

## Agent And Skill Docs

- `docs/agents/` — product agent catalog: Autonomous Creative Director, Layout Refresh Specialist, Stat Block Repair Specialist, Random Table Expansion Specialist, Utility Densifier Specialist, Pretext Layout Parity Auditor.
- `docs/skills/` — repo-specific execution runbooks: Change Completion Workflow (detailed ship rules), Pretext Layout Regression, Layout Review Triage, Safe Document Mutation, Agent Run Operations.

When working on the autonomous editor runtime or the Pretext layout stack, read the relevant skill doc before starting.

## Style Conventions

- Purple accent color system (`#7c3aed` / `purple-600`)
- Tailwind CSS utility classes, no CSS modules
- `transition-colors` on interactive elements
- Custom scrollbar styling
- No ESLint/Prettier configured — rely on TypeScript strict mode
