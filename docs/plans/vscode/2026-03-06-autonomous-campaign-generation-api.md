# Autonomous Campaign Generation API Plan

> **Planning Only:** This document defines the intended API surface, payload contracts, progress events, and error model for autonomous campaign generation.

**Companion Docs:**
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-design.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-ux.md`
- `docs/plans/vscode/2026-03-06-autonomous-campaign-generation-implementation.md`

---

## API Design Goals

1. Support background generation runs decoupled from live HTTP request lifetimes.
2. Expose enough structure for a rich client review experience.
3. Make regeneration and assembly explicit operations.
4. Keep the API project-scoped and auth-consistent with existing AI routes.
5. Support both polling and lightweight progress streaming.

---

## Resource Model

Primary resources:
- generation run
- generation task
- generated artifact
- artifact evaluation
- canon entity
- assembly manifest

---

## Authentication And Authorization

All endpoints should require the same authenticated user model as existing project AI routes.

Rules:
- every run belongs to one project and one user
- users may only access runs for projects they own
- regeneration and assembly actions require ownership of the run’s project
- progress streams should terminate if auth expires or ownership checks fail

---

## Endpoints

## 1. Create Generation Run

### `POST /api/projects/:projectId/ai/generation-runs`

**Purpose:** Start a new autonomous generation run.

**Request Body:**
```json
{
  "prompt": "Create a 48-page gothic adventure for level 5 characters set in a haunted port city.",
  "mode": "module",
  "pageTarget": 48,
  "generationStyle": "autonomous",
  "constraints": {
    "tone": "gothic horror",
    "includeMaps": true,
    "includeHandouts": true,
    "strict5e": true
  }
}
```

**Field Notes:**
- `prompt` required
- `mode` optional; system may infer if omitted
- `pageTarget` optional but recommended for larger runs
- `generationStyle` optional; values: `autonomous`, `guided`
- `constraints` optional JSON object for future extensibility

**Response:**
```json
{
  "run": {
    "id": "run_123",
    "projectId": "project_123",
    "status": "queued",
    "mode": "module",
    "pageTarget": 48,
    "generationStyle": "autonomous",
    "currentStage": "queued",
    "progressPercent": 0,
    "createdAt": "2026-03-06T12:00:00.000Z"
  }
}
```

---

## 2. List Generation Runs For A Project

### `GET /api/projects/:projectId/ai/generation-runs`

**Purpose:** Show all runs associated with a project.

**Response:**
```json
{
  "runs": [
    {
      "id": "run_123",
      "status": "planning",
      "mode": "campaign",
      "currentStage": "planning",
      "progressPercent": 12,
      "createdAt": "2026-03-06T12:00:00.000Z",
      "updatedAt": "2026-03-06T12:03:00.000Z"
    }
  ]
}
```

---

## 3. Get Run Summary

### `GET /api/ai/generation-runs/:runId`

**Purpose:** Return the top-level run state for dashboards and detail views.

**Response:**
```json
{
  "run": {
    "id": "run_123",
    "projectId": "project_123",
    "status": "generating_prose",
    "mode": "campaign",
    "generationStyle": "autonomous",
    "currentStage": "generating_prose",
    "progressPercent": 58,
    "estimatedPages": 112,
    "estimatedTokens": 240000,
    "estimatedCost": 18.5,
    "actualTokens": 92000,
    "actualCost": 6.9,
    "failureReason": null,
    "createdAt": "2026-03-06T12:00:00.000Z",
    "startedAt": "2026-03-06T12:00:10.000Z",
    "completedAt": null
  },
  "summary": {
    "artifactCounts": {
      "queued": 8,
      "generated": 14,
      "passed": 10,
      "failed_evaluation": 2,
      "accepted": 8
    },
    "taskCounts": {
      "queued": 10,
      "running": 3,
      "completed": 27,
      "failed": 1
    }
  }
}
```

---

## 4. Get Run Tasks

### `GET /api/ai/generation-runs/:runId/tasks`

**Purpose:** Return the task graph or flattened task list.

**Query Parameters:**
- `view=flat|tree`
- `status=` optional filter
- `artifactType=` optional filter

**Response:**
```json
{
  "tasks": [
    {
      "id": "task_123",
      "parentTaskId": null,
      "taskType": "generate_campaign_bible",
      "artifactType": "campaign_bible",
      "artifactKey": "main",
      "status": "completed",
      "attemptCount": 1,
      "maxAttempts": 2,
      "dependsOn": ["task_normalize_input"],
      "startedAt": "2026-03-06T12:00:20.000Z",
      "completedAt": "2026-03-06T12:01:00.000Z"
    }
  ]
}
```

---

## 5. List Artifacts

### `GET /api/ai/generation-runs/:runId/artifacts`

**Purpose:** Browse staged artifacts.

**Query Parameters:**
- `artifactType=` optional
- `status=` optional
- `includeContent=` boolean
- `version=` optional latest or specific version

**Response:**
```json
{
  "artifacts": [
    {
      "id": "artifact_123",
      "artifactType": "chapter_draft",
      "artifactKey": "chapter-2",
      "status": "generated",
      "version": 2,
      "title": "Chapter 2: The Drowned Quarter",
      "summary": "Investigation and faction conflict in the flooded district.",
      "pageEstimate": 14,
      "metadata": {
        "chapterNumber": 2,
        "dependsOnEntities": ["npc_1", "loc_4"]
      }
    }
  ]
}
```

---

## 6. Get Single Artifact Detail

### `GET /api/ai/generation-runs/:runId/artifacts/:artifactId`

**Purpose:** View one artifact version including content and provenance.

**Response:**
```json
{
  "artifact": {
    "id": "artifact_123",
    "artifactType": "chapter_draft",
    "artifactKey": "chapter-2",
    "status": "failed_evaluation",
    "version": 2,
    "title": "Chapter 2: The Drowned Quarter",
    "summary": "Investigation and faction conflict in the flooded district.",
    "markdownContent": "## Arrival...",
    "tiptapContent": {},
    "metadata": {
      "chapterNumber": 2,
      "sourceTaskId": "task_123"
    }
  }
}
```

---

## 7. Get Evaluations

### `GET /api/ai/generation-runs/:runId/evaluations`

**Purpose:** Return evaluation reports for the run.

**Query Parameters:**
- `artifactId=` optional
- `evaluationType=` optional
- `latestOnly=` boolean

**Response:**
```json
{
  "evaluations": [
    {
      "id": "eval_123",
      "artifactId": "artifact_123",
      "artifactVersion": 2,
      "evaluationType": "chapter_quality",
      "score": 74,
      "passed": false,
      "findings": [
        {
          "severity": "major",
          "code": "continuity.location_conflict",
          "message": "The chapter places the chapel in the harbor district instead of the hill district."
        }
      ],
      "recommendedActions": [
        {
          "action": "revise_artifact",
          "scope": "chapter-2"
        }
      ],
      "createdAt": "2026-03-06T12:20:00.000Z"
    }
  ]
}
```

---

## 8. List Canon Entities

### `GET /api/ai/generation-runs/:runId/canon`

**Purpose:** Support the canon browser and continuity review.

**Query Parameters:**
- `entityType=` optional
- `search=` optional

**Response:**
```json
{
  "entities": [
    {
      "id": "npc_1",
      "entityType": "NPC",
      "canonicalName": "Marrow Vane",
      "aliases": ["Captain Vane"],
      "canonicalData": {
        "role": "smuggler captain",
        "motivation": "protect her crew from the drowned cult"
      }
    }
  ]
}
```

---

## 9. Pause Run

### `POST /api/ai/generation-runs/:runId/pause`

**Purpose:** Pause further task dispatching.

**Response:**
```json
{ "success": true, "status": "paused" }
```

---

## 10. Resume Run

### `POST /api/ai/generation-runs/:runId/resume`

**Purpose:** Resume a paused or recoverable failed run.

**Response:**
```json
{ "success": true, "status": "planning" }
```

---

## 11. Cancel Run

### `POST /api/ai/generation-runs/:runId/cancel`

**Purpose:** Stop the run permanently.

**Response:**
```json
{ "success": true, "status": "cancelled" }
```

---

## 12. Regenerate Artifact

### `POST /api/ai/generation-runs/:runId/regenerate-artifact`

**Purpose:** Trigger targeted regeneration of one artifact or subtree.

**Request Body:**
```json
{
  "artifactId": "artifact_123",
  "reason": "Fix continuity issue with chapel location.",
  "scope": "artifact_only"
}
```

**Field Notes:**
- `scope` values: `artifact_only`, `artifact_and_dependents`

**Response:**
```json
{
  "success": true,
  "queuedTasks": ["task_regen_1", "task_eval_1"]
}
```

---

## 13. Assemble Documents

### `POST /api/ai/generation-runs/:runId/assemble`

**Purpose:** Assemble accepted artifacts into project documents.

**Request Body:**
```json
{
  "manifestVersion": "latest",
  "target": "project_documents"
}
```

**Response:**
```json
{
  "success": true,
  "documents": [
    {
      "id": "doc_123",
      "title": "The Drowned Crown Campaign"
    }
  ]
}
```

---

## 14. Progress Stream

### `GET /api/ai/generation-runs/:runId/stream`

**Purpose:** Provide lightweight SSE updates about run progress.

**Important Rule:** The stream reflects background state; it does not own execution.

## SSE Event Types

### `run_status`
```json
{
  "type": "run_status",
  "status": "generating_prose",
  "currentStage": "generating_prose",
  "progressPercent": 58
}
```

### `task_started`
```json
{
  "type": "task_started",
  "taskId": "task_123",
  "taskType": "generate_chapter_section",
  "artifactKey": "chapter-2/section-3"
}
```

### `task_completed`
```json
{
  "type": "task_completed",
  "taskId": "task_123",
  "artifactId": "artifact_789"
}
```

### `artifact_evaluated`
```json
{
  "type": "artifact_evaluated",
  "artifactId": "artifact_789",
  "passed": false,
  "score": 74
}
```

### `run_warning`
```json
{
  "type": "run_warning",
  "code": "budget.overrun_risk",
  "message": "Current page estimate exceeds target by 18%."
}
```

### `run_failed`
```json
{
  "type": "run_failed",
  "message": "Run failed after repeated evaluation failure in chapter 5."
}
```

### `run_completed`
```json
{
  "type": "run_completed",
  "documents": [{ "id": "doc_123", "title": "The Drowned Crown Campaign" }]
}
```

---

## Error Model

## Standard Error Envelope

```json
{
  "error": {
    "code": "generation_run_not_found",
    "message": "Generation run not found.",
    "details": null
  }
}
```

## Expected Error Codes

- `project_not_found`
- `generation_run_not_found`
- `generation_run_not_mutable`
- `generation_run_not_resumable`
- `artifact_not_found`
- `artifact_not_regenerable`
- `assembly_preconditions_failed`
- `validation_failed`
- `auth_required`
- `forbidden`
- `rate_limited`
- `stream_unavailable`

---

## API Evolution Rules

1. Additive changes to JSON payloads should preserve backward compatibility.
2. Artifact and task type identifiers should be stable strings, not UI labels.
3. SSE events should include a `type` discriminator and avoid ambiguous payloads.
4. Long-form content should not be streamed inline through these endpoints except where explicitly requested by artifact detail routes.

---

## API Prerequisites For Implementation

Before implementation:
1. finalize run status enum values
2. finalize artifact status enum values
3. finalize artifact type identifiers
4. finalize SSE event shapes and versioning policy
5. finalize pagination behavior for large artifact and task lists
