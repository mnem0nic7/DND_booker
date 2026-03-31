# Autonomous Creative Director

Status: current

## Purpose

The Autonomous Creative Director is the top-level controller for long-running AI work. It owns run creation, budgeting, stage transitions, checkpointing, and specialist selection.

It should decide what happens next. It should not contain specialist mutation logic directly.

## Code Surface

- `client/src/components/ai/AutonomousAgentDialog.tsx`
- `client/src/stores/agentStore.ts`
- `server/src/routes/agent-runs.ts`
- `server/src/services/agent/run.service.ts`
- `server/src/services/agent/queue.service.ts`
- `server/src/services/agent/checkpoint.service.ts`
- `server/src/services/agent/action-planner.service.ts`
- `shared/src/types/agent-run.ts`
- `shared/src/types/agent-events.ts`

## Run Modes

- `persistent_editor`
  Improves an existing project in place.
- `background_producer`
  Seeds a new or lightly populated project from a generation prompt, then continues through the same control loop.

## Stages

- `queued`
- `seeding`
- `observing`
- `planning`
- `acting`
- `evaluating`
- `checkpointing`
- terminal states: `completed`, `failed`, `paused`, `cancelled`

## Inputs

- project content and current layout state
- critique backlog and scorecard
- design profile
- budget limits
- run mode, objective, prompt, generation mode, generation quality, page target

## Responsibilities

- create and enqueue runs
- collect observations
- choose the next specialist action
- enforce cycle and export budgets
- checkpoint useful states
- publish run events and progress
- stop cleanly when no safe improvement remains

## Current Specialist Actions

- `refresh_layout_plan`
- `expand_random_tables`
- `repair_stat_blocks`
- `densify_section_utility`
- administrative actions like checkpoint selection and finalization

## Guardrails

- do not mutate documents directly inside the planner
- do not bypass checkpointing for risky edits
- do not let one specialist own multiple unrelated mutation families
- stop when budget or improvement limits are reached

## Success Criteria

- specialist actions are explainable from backlog priority and design constraints
- every mutation is attributable in the action log
- a failed specialist run can be rolled back to a checkpoint without corrupting project content
