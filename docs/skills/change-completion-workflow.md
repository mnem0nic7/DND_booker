# Change Completion Workflow

## Purpose

Use this workflow whenever an accepted code change should be carried through to a shippable state.

## Default Flow

1. inspect the touched code paths and confirm the runtime impact
2. run scoped verification for the touched packages and features
3. update repo memory and docs when behavior, operations, or workflow expectations changed
4. commit intentionally
5. push the branch
6. redeploy the affected runtime

Do not stop after code edits unless the user explicitly says not to ship.

## Verification Rules

- prefer package-scoped verification over a blind full-repo sweep
- regenerate checked-in SDK or spec output before shipping when route contracts changed
- remove accidental compiled artifacts from source directories before commit
- if infrastructure blocks a test or deploy, record the exact blocker

## Production Rule

For Cloud Run, treat changes under `client/`, `server/`, `worker/`, `shared/`, `sdk/`, `deploy/cloudrun/`, and Prisma schema or migration changes as redeploy-triggering by default.
