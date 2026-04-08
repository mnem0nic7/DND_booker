# Change Completion Workflow

## Purpose

Use this workflow whenever an accepted code change should be carried through to a shippable state.

## Default Flow

1. inspect the touched code paths and confirm the runtime impact
2. run the ship-check path unless the user explicitly narrowed the scope
3. update repo memory and docs when behavior, operations, or workflow expectations changed
4. commit intentionally
5. push the branch
6. redeploy the affected runtime

Do not stop after code edits unless the user explicitly says not to ship.

## Verification Rules

- prefer package-scoped verification over a blind full-repo sweep
- regenerate checked-in SDK or spec output before shipping when route contracts changed
- default to `npm run verify:ship`
- `npm run verify:ship` means:
  - `npm run verify`
  - `npm run test:unit --workspace=client`
  - `npm run test:server:local -- documents.v1.test.ts runs.v1.test.ts`
- when `api/v1` routes validate responses against schemas with ISO timestamps, normalize transport DTOs before schema parsing instead of feeding raw Prisma rows directly into the validator
- keep list endpoints on summary schemas and detail endpoints on detail schemas; summary payloads should never be parsed with full-detail contracts
- when the local server integration test depends on Cloud SQL access, record the exact GCP blocker if it cannot run
- remove accidental compiled artifacts from source directories before commit
- if infrastructure blocks a test or deploy, record the exact blocker

## Production Rule

For Cloud Run, treat changes under `client/`, `server/`, `worker/`, `shared/`, `sdk/`, `deploy/cloudrun/`, and Prisma schema or migration changes as redeploy-triggering by default.

The authenticated Cloud Run smoke should exercise at least one write path, not just read-only health checks. The current default is to create and immediately cancel a quick `api/v1` generation run so transport serialization and queue-backed run creation are covered after deploy.
