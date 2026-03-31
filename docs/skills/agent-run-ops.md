# Agent Run Operations

## Purpose

Use this skill when operating, debugging, or documenting the persistent agent runtime.

## Core Surface

- `POST /api/projects/:projectId/ai/agent-runs`
- `GET /api/projects/:projectId/ai/agent-runs`
- `GET /api/projects/:projectId/ai/agent-runs/:runId`
- `POST /api/projects/:projectId/ai/agent-runs/:runId/pause`
- `POST /api/projects/:projectId/ai/agent-runs/:runId/resume`
- `POST /api/projects/:projectId/ai/agent-runs/:runId/cancel`
- `GET /api/projects/:projectId/ai/agent-runs/:runId/checkpoints`
- `POST /api/projects/:projectId/ai/agent-runs/:runId/checkpoints/:checkpointId/restore`
- `GET /api/projects/:projectId/ai/agent-runs/:runId/actions`
- `GET /api/projects/:projectId/ai/agent-runs/:runId/stream`

## Operating Rules

- use `persistent_editor` to improve an existing project
- use `background_producer` when a generation prompt is required
- keep budgets explicit for long runs
- publish and observe checkpoints for any action that may degrade quality
- prefer restore over ad hoc reversal when a run regresses

## What To Capture In Documentation Or Incident Notes

- mode and objective
- current stage and budget
- chosen specialist action
- latest scorecard and backlog summary
- checkpoint used for rollback, if any
- whether the failure was content, layout, or parity-related
