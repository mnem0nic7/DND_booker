# DND Booker

DND Booker is a monorepo for writing, laying out, and exporting D&D publications for DriveThruRPG and DMsGuild. The current runtime combines a live paginated TipTap editor, an Express + Prisma API, a BullMQ worker for export and autonomous AI runs, and shared publication/layout contracts used across the stack.

## Workspace

| Package | Purpose | Key tech |
| --- | --- | --- |
| `client/` | Auth UI, dashboard, live paginated editor, AI panels, run dashboards | React 19, TipTap v3, Zustand, Tailwind CSS v4, Vite |
| `server/` | `api/v1` HTTP surface, auth, project/document authority, AI/chat/wizard logic | Express 4.21, Prisma 6, Vercel AI SDK, Zod |
| `worker/` | Export jobs plus generation and agent orchestration | BullMQ, Typst, Playwright Core |
| `shared/` | Shared schemas, route contracts, layout/runtime types, publication document types | TypeScript, Zod |
| `sdk/` | Generated typed client for the `api/v1` surface | TypeScript, Axios |
| `text-layout/` | Local layout engine and helpers used by preview/export flows | Pretext-derived layout tooling |

## Runtime At A Glance

```text
Client (:3000) -> Server (:4000) -> PostgreSQL
                              -> Redis/BullMQ -> Worker
                              -> GCS/local object storage
```

- The client edits publication documents, not just a single project blob.
- The server owns auth, the `api/v1` contract, document persistence, AI endpoints, and run creation.
- The worker drains `export`, `generation`, `agent`, and `cleanup` queues.
- `shared/` defines the transport and publication contract, and `sdk/` generates the typed client the frontend uses.

## Current Product Surface

- Live paginated editor: the visible TipTap surface is the real editor, hydrated from saved `standard_pdf` layout snapshots and kept in parity with export pagination.
- Publication documents: projects are materialized into ordered `ProjectDocument` rows for front matter, chapters, appendices, and back matter.
- AI assistant: per-project chat, working memory, long-term memory, task planning, block generation, autofill, wizard flows, and image generation.
- AI team dashboard: `/ai-team` is the dashboard-first control surface for creator/designer/editor/engineer runs, recent all-project history, linked child-run lineage, and engineering PR follow-through.
- Generation runs: durable worker-driven runs expose tasks, artifacts, canon entities, evaluations, assembly manifests, and approval interrupts.
- Agent runs: persistent editor/background producer runs expose checkpoints, action logs, restore points, and approval interrupts.
- Improvement loops: project-scoped and create-and-run AI-team loops persist creator/designer/editor/engineer artifacts plus GitHub-backed engineering apply results.
- Export: PDF, print-ready PDF, and ePub job APIs backed by Playwright preflight/review plus Typst final PDF rendering.
- Storage: uploads and export artifacts use local disk in dev and Google Cloud Storage when `GCS_BUCKET` is configured.

## Themes

- Active default theme: `gilded-folio`
- Supported stored theme IDs: `gilded-folio`, `classic-parchment`, `dark-tome`, `clean-modern`, `fey-wild`, `infernal`
- Legacy stored variant: `dmguild` is still accepted in persisted settings and shared layout code, but the active client theme state normalizes it to `gilded-folio`

## Quick Start

```bash
npm install
cp .env.example .env

# Start local infra
docker compose up -d postgres redis

# Apply schema and seed starter templates
cd server
npx prisma migrate dev --name init
npx prisma db seed
cd ..

# Registration is invite-only, including local dev
npm run invites --workspace=server -- add you@example.com "local dev"

# Run the app
npm run dev --workspace=server
npm run dev --workspace=client
npm run dev --workspace=worker
```

Open `http://localhost:3000` after the client and server are running.

If you prefer the full Docker Compose stack, you can also run:

```bash
docker compose up -d
```

## Local Development Notes

- Root env file: use a single `.env` at the repo root, not separate per-package env files.
- Important local vars: `DATABASE_URL`, `REDIS_HOST`, `REDIS_PORT`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `AI_KEY_ENCRYPTION_SECRET`, `CLIENT_URL`
- Optional layout/export vars: `TEXT_LAYOUT_ENGINE_MODE`, `VITE_TEXT_LAYOUT_ENGINE_MODE`, `TEXT_LAYOUT_THEME`
- Production/storage vars: `GCS_BUCKET`, `SERVER_BASE_URL`, `WORKER_CONCURRENCY`
- API keys are stored encrypted with AES-256-GCM. Generate `AI_KEY_ENCRYPTION_SECRET` with `openssl rand -hex 32`.

## API Surface

Product traffic should use `/api/v1/*`. Legacy product `/api/*` compatibility routes are no longer the active runtime surface.

- Source of truth: `/api/v1/openapi.json`
- Auth/session: `/api/v1/auth/*`
- Projects: `/api/v1/projects`
- Publication documents: `/api/v1/projects/:projectId/documents/*`
- Generation and agent runs: `/api/v1/projects/:projectId/generation-runs/*`, `/api/v1/projects/:projectId/agent-runs/*`, and interrupt endpoints under the same project scope
- AI settings and generation helpers: `/api/v1/ai/*`
- Project-scoped AI chat, memory, planning, and wizard flows: `/api/v1/projects/:projectId/ai/*`
- AI-team loops and workspace history: `/api/v1/improvement-loops/default-engineering-target`, `/api/v1/improvement-loops/recent`, `/api/v1/projects/:projectId/improvement-loops/*`
- Assets/templates: `/api/v1/projects/:projectId/assets`, `/api/v1/assets/:id`, `/api/v1/templates`
- Export jobs: `/api/v1/projects/:projectId/export-jobs`, `/api/v1/export-jobs/:jobId*`

The frontend uses the generated SDK client in `sdk/` for projects, documents, runs, and exports.

## Persistence Model

- `ProjectDocument` is the authoritative publication unit.
- `Project.content` still exists, but it is now a compatibility cache rebuilt from ordered project documents.
- Canonical document writes should keep `content`, `canonicalDocJson`, `editorProjectionJson`, `typstSource`, `layoutSnapshotJson`, `layoutEngineVersion`, and version fields in sync.
- Generation and agent runs checkpoint progress in `graphStateJson.runtime`, and approval/edit/reject gates persist under interrupts.

## Verification

```bash
# Build all packages and regenerate the v1 SDK
npm run verify

# Shippable verification path
npm run verify:ship

# Focused suites
npm run test:unit --workspace=client
npm test --workspace=server
npm run test --workspace=worker
npm run test:server:local -- documents.v1.test.ts
```

- `npm run verify` regenerates the checked-in SDK/OpenAPI output and builds `shared`, `sdk`, `server`, `worker`, and `client`.
- `npm run verify:ship` adds the worker/client/server suites used for the normal ship path.
- If local Postgres, Redis, or the Cloud SQL proxy-backed integration harness is unavailable, record that blocker explicitly.

## Deploying

Default production flow:

```bash
npm run verify:ship
git status
git add <intended paths>
git commit -m "<message>"
git push origin main
npm run deploy:cloudrun
```

- Cloud Run is split into a public web service and a worker service.
- `npm run deploy:cloudrun` builds once, deploys web first, injects the resolved web URL into worker `SERVER_BASE_URL`, checks health/readiness, and runs the authenticated smoke when `SMOKE_TEST_EMAIL` and `SMOKE_TEST_PASSWORD` are set.
- Set `SMOKE_IMPROVEMENT_LOOP_REPOSITORY_FULL_NAME` and `SMOKE_IMPROVEMENT_LOOP_INSTALLATION_ID` to run the dedicated improvement-loop smoke after deploy. If those are omitted, the smoke now falls back to the live default engineering target published by `/api/v1/improvement-loops/default-engineering-target`.
- The improvement-loop smoke now also verifies `/api/v1/improvement-loops/recent` so the dashboard history feed is covered on the live Cloud Run path, not just local builds.
- Set `SMOKE_KEEP_PROJECT=1` to retain the smoke-created project instead of deleting it during script cleanup. Retained improvement-loop smokes can be reviewed afterward from `/ai-team`.
- For Redis or queue-durability changes, run `npm run ops:redis:check` before or during deploy triage.

More deployment detail lives in:

- [deploy/cloudrun/README.md](deploy/cloudrun/README.md)
- [docs/runbooks/cloudrun-web-worker.md](docs/runbooks/cloudrun-web-worker.md)

## Contributor Docs

- [docs/architecture/current-state.md](docs/architecture/current-state.md) - contributor deep dive into package boundaries, persistence, and runtime data flow
- [docs/agents/README.md](docs/agents/README.md) - product agent catalog
- [docs/skills/README.md](docs/skills/README.md) - repo-specific execution guides

## License

MIT
