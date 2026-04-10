# Cloud Run Deployment

This repo is deployed to Google Cloud Run as two services:

- web service `dnd-booker`
  - `client` is the ingress container
  - `server` runs on `localhost:4000`
  - `cloudsql-proxy` serves Postgres on `localhost:5432`
- worker service `dnd-booker-worker`
  - `worker` runs BullMQ consumers
  - `cloudsql-proxy` serves Postgres on `localhost:5432`
  - `SERVER_BASE_URL` points at the web service URL instead of `localhost`
  - Cloud Run injects the worker `PORT`; do not set it manually in the standalone worker manifest
  - the worker runs a periodic runtime audit that logs `OPS_AUDIT_VIOLATION` when queued work, BullMQ queue backlog, or pending approvals go stale

Use [`service.yaml`](/home/gallison/workspace/DND_booker/deploy/cloudrun/service.yaml) for the web service, [`worker-service.yaml`](/home/gallison/workspace/DND_booker/deploy/cloudrun/worker-service.yaml) for the worker service, and the matching `*.example` files as templates.

## What You Need

- Cloud Run
- Cloud SQL for PostgreSQL
- Memorystore for Redis
- Artifact Registry
- A service account for Cloud Run

Google documents the key platform pieces here:

- Cloud Run sidecars and localhost networking: https://docs.cloud.google.com/run/docs/deploying
- Nginx frontend proxy pattern for Cloud Run: https://docs.cloud.google.com/run/docs/internet-proxy-nginx-sidecar
- Cloud SQL Auth Proxy container: https://cloud.google.com/sql/docs/postgres/connect-run
- Memorystore Redis from Cloud Run: https://cloud.google.com/memorystore/docs/redis/connect-redis-instance-cloud-run
- Secret Manager env vars for Cloud Run: https://cloud.google.com/run/docs/configuring/services/secrets
- Cloud Storage client libraries for Node.js: https://cloud.google.com/storage/docs/reference/libraries

## Storage

Uploaded assets and generated export files are now stored in Google Cloud Storage when `GCS_BUCKET` is set.

The app still exposes the same authenticated routes:

- `/uploads/:projectId/:filename`
- `/api/v1/export-jobs/:jobId/download`

That keeps auth and URL shape stable while removing the shared-disk dependency that Cloud Run cannot provide reliably.

The worker still writes short-lived temporary files locally while rendering PDFs for the review pipeline. Those files do not need durable storage.

PDF exports now use a split pipeline:

- HTML/Playwright still measures page models for preflight and export review
- Typst produces the final PDF artifact that gets uploaded
- referenced `uploads/...` assets are staged into a temporary Typst workspace before compilation so the export path works with GCS-backed production storage as well as local disk
- wrap-eligible text inserts now share one flow classification between preview and Typst export, and final Typst wrapping uses the vendored `@preview/wrap-it:0.1.1` package under `worker/assets/typst/packages`
- the worker sets `TYPST_PACKAGE_PATH` to that vendored package root before compilation, so Cloud Run does not need live Typst package downloads during export

`Project.content` is now a compatibility cache only. The authoritative publication state lives on `ProjectDocument.layoutPlan`, `canonicalDocJson`, `editorProjectionJson`, `typstSource`, `layoutSnapshotJson`, `layoutEngineVersion`, `layoutSnapshotUpdatedAt`, and their version fields. Any document mutation should keep that publication bundle in sync and then rebuild the aggregate project content cache from ordered project documents.
That includes AI wizard apply flows: they must merge against canonical project content and save back through the canonical project-content service instead of patching `Project.content` directly.
Export creation now materializes `ProjectDocument` rows before queueing worker jobs. The worker still has a final monolithic `Project.content` fallback for older compatibility cases, but that path should not be the active source of truth.
The worker now treats the saved `LayoutRuntimeV2` snapshot as the pagination contract for preview/export preflight. When a document is missing a current snapshot, export rebuilds and persists it before final PDF rendering.
The client editor now hydrates from that saved `standard_pdf` snapshot on document load, keeps the live visible TipTap surface paginated through snapshot-driven decorations, and persists refreshed `layoutSnapshotJson` through the normal v1 document save path as content changes settle.
PDF export now follows the same saved snapshot contract. If export needs normalization or layout repair, it persists the corrected document bundle and refreshed snapshot first and then renders; it no longer relies on export-only structural injection for title pages, ToCs, chapter openers, or page/column pagination.
Generation orchestration also routes model selection per stage through the checked-in agent model presets. That prevents a user's experimental chat model from becoming the structured-output model for outline, canon, chapter draft, or evaluation nodes during the deploy smoke or live generation runs. Quick-mode Google generations intentionally use the Flash lane for the heavier structured stages so deploy smoke and invite-only one-shot generation do not depend on `gemini-2.5-pro` capacity being available in that moment.
The worker also enforces a hard timeout on the core generation nodes. If a provider call hangs inside intake, bible, outline, canon expansion, chapter planning, or chapter drafting, the node now errors and retries from the last persisted checkpoint instead of leaving the run stuck indefinitely.
Legacy product `/api/*` compatibility routes have been removed. Keep health and infra probes on `/api/health`, and use `/api/v1/*` for app traffic, smoke tests, and operator tooling.

## Invite-Only Registration

Registration is now controlled by the `registration_invites` table instead of `REGISTRATION_ALLOWED_EMAILS`.

Manage invites from the repo root with:

```bash
npm run invites --workspace=server -- list
npm run invites --workspace=server -- add invited@example.com "launch invite"
npm run invites --workspace=server -- revoke invited@example.com
```

Existing users can still log in normally. New registrations require an active invite row.

## Monitoring And Alerting

Install the checked-in Cloud Monitoring policies after the web/worker services exist:

```bash
export PROJECT_ID="dnd-booker"
export REGION="us-west4"
export WEB_SERVICE="dnd-booker"
export WORKER_SERVICE="dnd-booker-worker"
export NOTIFICATION_CHANNELS="projects/dnd-booker/notificationChannels/1234567890"
npm run monitor:cloudrun:install
```

The installer creates alerts for:

- web request 5xxs
- generation failures in the worker
- export failures in the worker
- runtime audit violations for stale queued work, stale BullMQ queue backlog, or stale pending interrupts
- worker restart churn based on repeated startup logs

Validate the monitoring wiring with one synthetic worker failure log:

```bash
npm run monitor:cloudrun:validate
```

That writes a synthetic `OPS_AUDIT_VIOLATION` log entry against the current worker revision so the `dnd-booker ops audit violations` policy can be confirmed end to end.

Operational triage lives in [docs/runbooks/cloudrun-web-worker.md](/home/gallison/workspace/DND_booker/docs/runbooks/cloudrun-web-worker.md).

## Run Resume Semantics

Generation runs and agent runs now persist their active graph node into each run record's `graphStateJson.runtime`. This matters on Cloud Run because a deploy, crash, or BullMQ retry should resume from the last durable node instead of replaying the full orchestration function.

Operational note:

- generation resumes are checkpoint-gated; if the API says a paused run has not reached a resumable checkpoint yet, wait for the worker to acknowledge the pause before calling resume again
- approval gates are now durable run state under `graphStateJson.interrupts`
- generation now emits a real publication-review gate before the final art/layout passes
- persistent editor agent runs now emit a real approval gate before applying the next planned mutation
- approving a gate auto-resumes the run, requesting edits keeps it paused for manual changes, and rejecting a gate cancels it
- the generation status machine intentionally allows `assembling -> paused` and `assembling -> cancelled`, otherwise publication-review gates spin on a pending interrupt instead of yielding
- agent runs still pause cooperatively in-process, so they do not require an explicit requeue on resume
- fixed-key generation artifacts now replay in place; the worker reuses the existing v1 intake, bible, outline, front matter, chapter plan, and chapter draft rows on retry instead of inserting duplicates
- document assembly also replays in place by reusing the run's v1 manifest and upserting `ProjectDocument` rows by `(projectId, slug)`, which keeps document IDs stable across retries and deploy interruptions

## Build And Push Images

Set these first:

```bash
export PROJECT_ID="your-gcp-project"
export REGION="us-central1"
export REPOSITORY="dnd-booker"
export TAG="$(git rev-parse --short HEAD)"
```

Create the Artifact Registry repo if needed:

```bash
gcloud artifacts repositories create "$REPOSITORY" \
  --repository-format=docker \
  --location="$REGION"
```

Build and push:

```bash
gcloud builds submit --tag "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/dnd-booker-client:$TAG" -f client/Dockerfile .
gcloud builds submit --tag "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/dnd-booker-server:$TAG" -f server/Dockerfile .
gcloud builds submit --tag "$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/dnd-booker-worker:$TAG" -f worker/Dockerfile .
```

If a container build starts failing on a missing workspace package such as `@dnd-booker/sdk`, check the Dockerfile first. The runtime Dockerfiles install root NPM workspaces, so each one must copy the relevant workspace `package.json` before `npm ci` and the workspace source tree afterward.

## Provision Backing Services

1. Create a Cloud SQL PostgreSQL instance and database.
2. Create a Memorystore Redis instance.
3. Create a Cloud Storage bucket for uploads and exports.
4. Put application secrets in Secret Manager.
5. Give the Cloud Run service account:
   - `roles/cloudsql.client`
   - `roles/artifactregistry.reader`
   - `roles/secretmanager.secretAccessor`
   - bucket-level `roles/storage.objectAdmin`
6. Configure Cloud Run VPC egress so it can reach Memorystore.
7. Keep the Redis instance on `maxmemory-policy=noeviction`.

For Redis, prefer Direct VPC egress unless you already standardize on Serverless VPC Access.
BullMQ is not safe on `volatile-lru` or similar eviction modes. Validate the live instance with:

```bash
npm run ops:redis:check
```

For this service, keep `run.googleapis.com/vpc-access-egress: private-ranges-only`. Using `all-traffic` without Cloud NAT breaks the Cloud SQL proxy because it cannot reach `sqladmin.googleapis.com`.

## Deploy

1. Build and push images with Cloud Build.
2. Update the image tags in [`service.yaml`](/home/gallison/workspace/DND_booker/deploy/cloudrun/service.yaml) and [`worker-service.yaml`](/home/gallison/workspace/DND_booker/deploy/cloudrun/worker-service.yaml) if you are not deploying `latest`.
3. Confirm these values in the manifests:
   - Cloud SQL instance connection name
   - Redis host
   - `GCS_BUCKET`
   - service account
   - `CLIENT_URL`
   - worker `SERVER_BASE_URL`
4. Deploy:

```bash
npm run deploy:cloudrun
```

The wrapper deploys the web service first, resolves the web URL, deploys the worker service with that web URL injected into `SERVER_BASE_URL`, checks web health, checks worker readiness, and then runs the authenticated acceptance smoke.

Then fetch the public web URL:

```bash
gcloud run services describe dnd-booker \
  --region="$REGION" \
  --format='value(status.url)'
```

## Default Redeploy Flow

For normal code changes, use this sequence from the repo root:

```bash
npm run verify:ship
git status
git add <intended paths>
git commit -m "<message>"
git push origin main
npm run deploy:cloudrun
```

For queue durability changes or after Redis maintenance, run this before deploy:

```bash
npm run ops:redis:check
```

`npm run deploy:cloudrun` wraps the safest repeatable production flow for this repo:

1. `gcloud builds submit --config deploy/cloudrun/cloudbuild.yaml --substitutions _REGION=us-west4,_REPO=dnd-booker,_TAG=<git-sha>`
2. render a temporary web manifest with that same image tag
3. `gcloud run services replace <rendered-web-manifest> --region=us-west4`
4. resolve the web service URL
5. render a temporary worker manifest with the same worker image tag and `SERVER_BASE_URL=<web-url>`
6. `gcloud run services replace <rendered-worker-manifest> --region=us-west4`
7. `gcloud run services describe dnd-booker --region=us-west4 --format='value(status.url)'`

`TAG` defaults to `git rev-parse --short HEAD`. Override `PROJECT_ID`, `REGION`, `REPOSITORY`, `TAG`, `WEB_SERVICE`, `WORKER_SERVICE`, or `DEPLOY_TARGET` in the environment if you need a non-default deploy target.

If you set these before deploy, the wrapper also runs an authenticated `api/v1` smoke test after the health check. This now applies to `DEPLOY_TARGET=worker` as well, so worker-only deploys still prove the live generation/export path:

```bash
export SMOKE_TEST_EMAIL="you@example.com"
export SMOKE_TEST_PASSWORD="your-password"
export SMOKE_TEST_GENERATION_PROMPT="optional smoke prompt override"
```

After deploy, verify:

- `curl -fsS "$URL/api/v1/health"`
- load `"$URL/"`
- confirm the authenticated `api/v1` smoke test passed, or run `npm run smoke:cloudrun:v1` manually if you skipped it during deploy
- note that the smoke now creates a temporary project, drives a generation run to the publication-review interrupt, approves and resumes it, creates an export job, downloads the resulting PDF, validates the `%PDF-` header, and then deletes the temp project
- project aggregate content saves, document layout saves, chat history loads, asset uploads/browses, and template loads all flow through `api/v1` now, so production editor regressions are more likely to show up in the same typed transport path the SDK uses

Local ship verification should also cover the `api/v1` project and run surfaces before deploy. `npm run verify:ship` now includes the worker `layout-visual-parity.test.ts` regression plus auth, AI, assets, templates, documents, projects, runs, agent restore, and generation route coverage through the Cloud SQL Proxy + local Redis harness so transport, orchestration, and preview/export layout drift regressions are caught before production.

## Seed Templates

Create or update the seed job:

```bash
gcloud run jobs replace deploy/cloudrun/seed-job.yaml --region="$REGION"
```

Run it:

```bash
gcloud run jobs execute dnd-booker-seed --region="$REGION" --wait
```
