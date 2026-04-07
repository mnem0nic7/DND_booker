# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DND Booker is a D&D content creation tool — a rich editor for campaigns, one-shots, supplements, and sourcebooks with AI-assisted writing, PDF/EPUB export, and 22+ custom block types (stat blocks, read-aloud boxes, NPC profiles, etc.).

## Architecture

NPM workspaces monorepo with six packages:

- **`client/`** — React 19 + Vite 6 + TipTap v3 editor + Tailwind CSS 4 + Zustand 5. Dev server on `:3000`, proxies `/api` to `:4000`.
- **`server/`** — Express 4.21 + Prisma 6 + Vercel AI SDK. JWT auth, AES-256-GCM encrypted API keys, rate limiting. Runs on `:4000`.
- **`worker/`** — BullMQ job processor for export and long-running generation/agent orchestration. Uses Typst + Playwright Core and writes durable artifacts to GCS in production.
- **`shared/`** — Shared types, Zod contracts, publication-document schemas, and route metadata. Imported as `@dnd-booker/shared`.
- **`text-layout/`** — Local layout engine and rendering helpers.
- **`sdk/`** — Generated `api/v1` OpenAPI spec and typed client built from the shared route catalog.

```
Client (:3000) → API proxy → Server (:4000) → PostgreSQL + Redis + GCS
                                    ↓ BullMQ
                           Worker (export + orchestration)
```

## Common Commands

```bash
# Dev servers (run from root)
npm run dev --workspace=server     # Express with tsx watch
npm run dev --workspace=client     # Vite dev server
npm run dev --workspace=worker     # Export worker

# Tests (Vitest + Supertest, requires running PostgreSQL + Redis)
npm test --workspace=server                          # All server tests
cd server && npx vitest run src/__tests__/auth.test.ts  # Single test file
cd server && npx vitest run --testNamePattern="should register"  # Single test

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

### Authentication
JWT access token (15min) + refresh token (7d, httpOnly cookie). Token version incremented on logout. Client axios interceptor auto-refreshes on 401.

### Encryption
User API keys encrypted with AES-256-GCM. IV + auth tag stored separately. Requires `AI_KEY_ENCRYPTION_SECRET` env var (64 hex chars).

### Document sidebar
DocumentList supports drag-reorder, inline rename (double-click), and two-click delete confirmation (first click shows "Delete?", 3s auto-reset). Truncated names show native tooltip via `title` attribute.

### Properties panel
PropertiesPanel shows document stats and a Document Outline that includes both H1-H3 headings and D&D blocks. Clicking an outline item scrolls to that position in the editor.

## Deployment

Docker Compose runs `postgres`, `redis`, `server`, `worker`, and `client`. Rebuild and restart the services that match the changed packages:

- `client/` only: `docker compose build client && docker compose up -d client`
- `server/` only: `docker compose build server && docker compose up -d server`
- `worker/` only: `docker compose build worker && docker compose up -d worker`
- `shared/` or cross-package changes: `docker compose build server worker client && docker compose up -d server worker client`

Ship flow for requested production updates: validate the touched paths, commit, push, and redeploy the affected services.

## Default Finish Flow

Unless the user explicitly says not to, treat this as the default after every code change:

1. Inspect the changed paths and sanity-check the diff.
2. Run the repo verification flow:
   - `npm run verify`
   - When `client/`, `sdk/`, or shared route contracts changed, also run `npm run test:unit --workspace=client`.
   - If a targeted integration test matters and local infra is unavailable, run what you can and record the exact blocker.
3. Update repo memory and docs when behavior, workflow, deployment steps, or architecture changed.
   - Memory: this file and any other standing repo guidance.
   - Docs: `README.md`, `deploy/cloudrun/README.md`, or the closest feature/runbook doc.
4. Review `git status`, commit the intended changes, and push the current branch.
5. Redeploy production with `npm run deploy:cloudrun` unless the user asked to skip deploys.

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
