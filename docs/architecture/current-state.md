# Current-State Architecture

This is the contributor-oriented map of the current DND Booker runtime. It is meant to answer "where does this behavior live?" before you have to read the entire repo.

## System Summary

DND Booker is a six-workspace monorepo:

| Package | Responsibility | Good starting points |
| --- | --- | --- |
| `client/` | React app for auth, dashboard, live paginated editing, AI UI, and run dashboards | `client/src/App.tsx`, `client/src/pages/EditorPage.tsx`, `client/src/stores/*` |
| `server/` | `api/v1`, auth/session, project/document persistence, AI routes, run creation | `server/src/index.ts`, `server/src/routes/v1/*`, `server/src/routes/ai.ts` |
| `worker/` | BullMQ queues for export, generation, agent, and cleanup jobs | `worker/src/index.ts`, `worker/src/jobs/*` |
| `shared/` | Shared API contracts, publication-document types, layout runtime, generation/agent types | `shared/src/api/v1.ts`, `shared/src/layout-runtime-v2.ts` |
| `sdk/` | Generated typed client consumed by the frontend | `sdk/src/generated/v1.ts` |
| `text-layout/` | Local layout engine and helper code used by preview/export flows | `text-layout/` |

Runtime topology:

```text
Client -> Server -> PostgreSQL
               -> Redis/BullMQ -> Worker
               -> GCS/local object storage
```

## Package Boundaries

### `client/`

- Routing is minimal: login, register, dashboard, and editor.
- The editor page loads both project-level data and per-document data.
- The generated SDK client is wired in `client/src/lib/api.ts`.
- Most runtime state lives in Zustand stores:
  - `authStore` for session and refresh
  - `projectStore` for projects, documents, and save queues
  - `themeStore` for active theme normalization
  - `aiStore` for settings, chat, wizard, planning, and image generation
  - `generationStore` for generation runs and related detail panes
  - `agentStore` for autonomous agent runs and restore flow
- `client/src/components/editor/EditorLayout.tsx` is the main editing shell. The paginated TipTap surface is the live editor, not a throwaway preview.

### `server/`

- `server/src/index.ts` is the mount graph.
- `server/src/routes/v1/*` owns the core `api/v1` surface:
  - auth
  - projects
  - documents
  - exports
  - runs
  - OpenAPI spec
- `server/src/routes/ai.ts` owns AI settings, generation helpers, project-scoped chat/state, and wizard routes.
- Business logic is mostly in `server/src/services/*`.
- Prisma schema is in `server/prisma/schema.prisma`.

### `worker/`

- `worker/src/index.ts` registers:
  - `export`
  - `cleanup`
  - `generation`
  - `agent`
- Export, generation, and agent orchestration are job-driven, not HTTP-driven.
- The worker owns long-running retries, concurrency, and runtime audit behavior.

### `shared/` and `sdk/`

- `shared/src/api/v1.ts` is the transport contract the server and SDK both depend on.
- `shared/` also owns publication-document schemas, layout runtime types, generation/agent run types, and helper logic shared by client/server/worker.
- `sdk/src/generated/v1.ts` is checked-in generated output. The client calls it through `createV1Client(...)`.

## Persistence Model

The biggest architectural shift in the current codebase is that `ProjectDocument`, not `Project.content`, is the authoritative publication unit.

### Core tables

- `Project`
  - metadata, settings, and a compatibility `content` cache
- `ProjectDocument`
  - authoritative publication rows for front matter, chapters, appendices, and back matter
  - stores canonical/editor/Typst/layout snapshot state
- `Asset`
  - uploaded project assets
- `ExportJob`
  - export queue state and output URL
- `RegistrationInvite`
  - invite-only registration gate

### AI memory tables

- `AiChatSession`, `AiChatMessage`
  - persisted project chat history
- `AiWorkingMemory`
  - rolling bullet summary for a project/user
- `AiMemoryItem`
  - long-term facts, either project-scoped or global
- `AiTaskPlan`
  - project/user task list used by the planning assistant
- `AiToolAudit`
  - audit log for server-side AI tool usage

### Run and artifact tables

- `GenerationRun`
  - durable worker-driven generation job state
  - includes `graphStateJson`, `graphThreadId`, `graphCheckpointKey`, `resumeToken`
- `GenerationTask`
  - task-level generation tracking
- `GeneratedArtifact`
  - generated outputs like intake, bible, outline, canon bundles, chapter drafts, review artifacts
- `ArtifactEvaluation`
  - evaluation state for generated artifacts
- `AssemblyManifest`
  - document assembly state for a generation run
- `CanonEntity`
  - run-generated canon entities surfaced in the UI
- `AgentRun`
  - persistent autonomous editor/background producer state
- `AgentCheckpoint`
  - restorable checkpoints for agent runs
- `AgentAction`
  - per-cycle action log
- `AgentObservation`, `AgentDecision`
  - agent-side observation/decision history

## Main Data Flows

### 1. Auth And Session

Relevant files:

- `server/src/routes/v1/auth.ts`
- `server/src/services/auth.service.ts`
- `client/src/lib/api.ts`
- `client/src/stores/authStore.ts`

Flow:

1. The client logs in or refreshes through `/api/v1/auth/*`.
2. The server returns an access token and sets a refresh cookie.
3. `client/src/lib/api.ts` attaches the access token to requests and retries once on `401` by calling `/api/v1/auth/refresh`.
4. Registration is invite-only. `registerUser(...)` requires an active `registration_invites` row.

### 2. Project Creation And Document Bootstrap

Relevant files:

- `server/src/services/project.service.ts`
- `server/src/services/project-document-bootstrap.service.ts`

Flow:

1. A project is created through `/api/v1/projects`.
2. The server resolves template content and project type.
3. `createProjectWithDocuments(...)` creates the project row and immediately materializes `ProjectDocument` rows from the template/project content.
4. Chapter/front-matter/back-matter splitting is handled in `splitProjectContentIntoDocuments(...)`.

Why this matters:

- A newly created project is expected to have document rows.
- Template/bootstrap changes usually belong in the project-document bootstrap service, not in a thin route handler.

### 3. Editing And Document Saves

Relevant files:

- `client/src/pages/EditorPage.tsx`
- `client/src/components/editor/EditorLayout.tsx`
- `client/src/stores/projectStore.ts`
- `server/src/routes/v1/documents.ts`
- `server/src/services/document-publication.service.ts`

Flow:

1. The editor page loads the project summary plus the document list.
2. The active document is loaded from `/api/v1/projects/:projectId/documents/:docId`.
3. `EditorLayout` hydrates TipTap from the document's `editorProjectionJson` and saved `layoutSnapshotJson`.
4. As the user edits, the client rebuilds a `standard_pdf` layout snapshot and sends document updates through `PATCH /api/v1/projects/:projectId/documents/:docId`.
5. The server normalizes and persists the publication bundle together.
6. After document changes, aggregate `Project.content` is rebuilt as a compatibility cache.

Key invariant:

- Do not update only one representation of a document body. Canonical, editor, Typst, and layout snapshot fields are meant to move together.

### 4. Layout Snapshot Parity

Relevant files:

- `shared/src/layout-runtime-v2.ts`
- `client/src/lib/useMeasuredLayoutDocument.ts`
- `client/src/components/editor/EditorLayout.tsx`
- `worker/src/jobs/export.job.ts`
- `server/src/services/document-publication.service.ts`

Flow:

1. The server or client can build `LayoutRuntimeV2` snapshots via `buildLayoutDocumentV2(...)`.
2. The live editor hydrates from the saved `standard_pdf` snapshot first.
3. The client may remeasure and republish a fresher snapshot during editing.
4. Export reuses or repairs the saved snapshot before rendering.

Key invariant:

- The saved `standard_pdf` snapshot is the parity contract between editor and export. `print_pdf` can use a separate in-memory snapshot, but should not overwrite the saved standard slot.

### 5. AI Chat, Memory, And Planning

Relevant files:

- `server/src/routes/ai.ts`
- `server/src/services/ai-memory.service.ts`
- `server/src/services/ai-planner.service.ts`
- `client/src/stores/aiStore.ts`

Flow:

1. The user configures an AI provider/model in `/api/v1/ai/settings`.
2. Per-project chat uses `/api/v1/projects/:projectId/ai/chat`.
3. The server loads planning context from working memory, task plan, and long-term memory.
4. Responses may update planning state through control-block parsing in `ai-planner.service.ts`.
5. The client store also exposes wizard flows, memory reset/remember/forget, and image generation UI.

Notes:

- Supported providers currently include Anthropic, Google, OpenAI, and Ollama.
- API keys are encrypted at rest.
- Ollama is treated specially: it may use a validated local base URL and can run without an API key.

### 6. Generation Runs

Relevant files:

- `server/src/routes/v1/runs.ts`
- `server/src/services/generation/*`
- `worker/src/jobs/generation-orchestrator.job.ts`
- `worker/src/graph/persisted-graph.ts`
- `client/src/stores/generationStore.ts`

Flow:

1. The client starts a run through `/api/v1/projects/:projectId/generation-runs`.
2. The server creates a durable `GenerationRun` row and enqueues BullMQ work.
3. The worker runs a persisted graph that checkpoints into `graphStateJson.runtime`.
4. The client subscribes to `/events` and loads related tasks, artifacts, canon entities, evaluations, assembly manifests, and interrupts via follow-up calls.
5. Approval/edit/reject gates are persisted as interrupts, not ephemeral in-memory pauses.

Key invariants:

- Retries should resume from the checkpointed node, not restart the orchestration blindly.
- Fixed-key durable artifacts/manifests are replay boundaries and should be reused across retries.
- Generation pause/resume is checkpoint-gated.

### 7. Agent Runs

Relevant files:

- `server/src/services/agent/*`
- `worker/src/jobs/agent-orchestrator.job.ts`
- `client/src/stores/agentStore.ts`

Flow:

1. The client starts an agent run through `/api/v1/projects/:projectId/agent-runs`.
2. The server persists the goal/budget and enqueues worker execution.
3. The worker runs a persisted graph for the top-level controller.
4. The client subscribes to `/events` and separately fetches checkpoints, actions, and interrupts.
5. Checkpoint restore can replay publication fields, not just raw document content.

Key invariants:

- Agent runs have durable restore points.
- Approval interrupts pause the run before the next planned mutation.
- Restores should bring canonical/editor/Typst/layout state back together.

### 8. Export Jobs

Relevant files:

- `server/src/routes/v1/exports.ts`
- `server/src/services/export.service.ts`
- `server/src/services/object-storage.service.ts`
- `worker/src/jobs/export.job.ts`
- `worker/src/generators/*`

Flow:

1. The client creates an export job for a project.
2. The server persists the job and enqueues work.
3. The worker loads current publication documents, preflights/reviews them, then renders final output.
4. In production, output artifacts are written to GCS when `GCS_BUCKET` is configured.
5. Downloads are served back through authenticated server routes.

Current rendering split:

- HTML + Playwright still matter for measurement/preflight/review.
- Typst is the final PDF renderer.

## Edit Here If You Need X

- Add or change HTTP transport types:
  - `shared/src/api/v1.ts`
  - regenerate via `npm run verify`
- Change route mounting or top-level middleware:
  - `server/src/index.ts`
- Change project creation/bootstrap behavior:
  - `server/src/services/project.service.ts`
  - `server/src/services/project-document-bootstrap.service.ts`
- Change document persistence or publication normalization:
  - `server/src/services/document-publication.service.ts`
- Change editor save behavior or document hydration:
  - `client/src/stores/projectStore.ts`
  - `client/src/components/editor/EditorLayout.tsx`
- Change layout parity behavior:
  - `shared/src/layout-runtime-v2.ts`
  - `client/src/lib/useMeasuredLayoutDocument.ts`
  - `worker/src/jobs/export.job.ts`
- Change AI chat/planning/wizard behavior:
  - `server/src/routes/ai.ts`
  - `server/src/services/ai-memory.service.ts`
  - `server/src/services/ai-planner.service.ts`
  - `client/src/stores/aiStore.ts`
- Change generation run behavior:
  - `server/src/services/generation/*`
  - `worker/src/jobs/generation-orchestrator.job.ts`
  - `client/src/stores/generationStore.ts`
- Change agent run behavior:
  - `server/src/services/agent/*`
  - `worker/src/jobs/agent-orchestrator.job.ts`
  - `client/src/stores/agentStore.ts`
- Change deploy/runtime operations docs:
  - `deploy/cloudrun/README.md`
  - `docs/runbooks/cloudrun-web-worker.md`
  - `scripts/redeploy-cloudrun.sh`

## Standing Invariants

- Use `/api/v1/*` for product traffic.
- Treat `ProjectDocument` as the authority and `Project.content` as a cache.
- Persist publication fields together, not piecemeal.
- Keep editor and export aligned through saved layout snapshots.
- Resume generation and agent work from persisted graph checkpoints.
- Treat interrupt state as durable run state, not UI-only state.
