# Agent Run Operations

## Purpose

Use this skill when operating, debugging, or documenting the persistent agent runtime.

## Core Surface

- `POST /api/v1/projects/:projectId/agent-runs`
- `GET /api/v1/projects/:projectId/agent-runs`
- `GET /api/v1/projects/:projectId/agent-runs/:runId`
- `POST /api/v1/projects/:projectId/agent-runs/:runId/pause`
- `POST /api/v1/projects/:projectId/agent-runs/:runId/resume`
- `POST /api/v1/projects/:projectId/agent-runs/:runId/cancel`
- `GET /api/v1/projects/:projectId/agent-runs/:runId/checkpoints`
- `POST /api/v1/projects/:projectId/agent-runs/:runId/checkpoints/:checkpointId/restore`
- `GET /api/v1/projects/:projectId/agent-runs/:runId/actions`
- `GET /api/v1/projects/:projectId/agent-runs/:runId/events`
- `GET /api/v1/projects/:projectId/interrupts`
- `GET /api/v1/projects/:projectId/agent-runs/:runId/interrupts`
- `POST /api/v1/projects/:projectId/agent-runs/:runId/interrupts/:interruptId/resolve`
- `GET /api/v1/projects/:projectId/generation-runs/:runId/interrupts`
- `POST /api/v1/projects/:projectId/generation-runs/:runId/interrupts/:interruptId/resolve`

## Operating Rules

- use `persistent_editor` to improve an existing project
- use `background_producer` when a generation prompt is required
- keep budgets explicit for long runs
- agent runs now checkpoint the active graph node into `AgentRun.graphStateJson.runtime`, so deploy interruptions and BullMQ retries should resume from the last durable node rather than restarting the whole loop
- approval gates now persist in `graphStateJson.interrupts`; the persistent editor pauses before applying the next planned mutation
- approving a gate auto-resumes the run
- requesting edits keeps the run paused so you can make manual document changes and then resume into a fresh observation/replanning pass
- rejecting a gate cancels the run
- publish and observe checkpoints for any action that may degrade quality
- prefer restore over ad hoc reversal when a run regresses
- after agent-runtime changes, run the scoped verification, update the relevant docs or runbooks, and redeploy the affected runtime

## What To Capture In Documentation Or Incident Notes

- mode and objective
- current stage and budget
- chosen specialist action
- latest scorecard and backlog summary
- checkpoint used for rollback, if any
- whether the failure was content, layout, or parity-related
