# Cloud Run Deployment

This repo is deployed to Google Cloud Run as a single multi-container service:

- `client` is the ingress container.
- `server` is a sidecar on `localhost:4000`.
- `worker` is a sidecar process that keeps BullMQ consumers running.

Use [`service.yaml`](/home/gallison/workspace/DND_booker/deploy/cloudrun/service.yaml) for the current production shape and [`service.yaml.example`](/home/gallison/workspace/DND_booker/deploy/cloudrun/service.yaml.example) as the generic template.

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
- `/api/export-jobs/:id/download`
- `/api/v1/export-jobs/:jobId/download`

That keeps auth and URL shape stable while removing the shared-disk dependency that Cloud Run cannot provide reliably.

The worker still writes short-lived temporary files locally while rendering PDFs for the review pipeline. Those files do not need durable storage.

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

For Redis, prefer Direct VPC egress unless you already standardize on Serverless VPC Access.

For this service, keep `run.googleapis.com/vpc-access-egress: private-ranges-only`. Using `all-traffic` without Cloud NAT breaks the Cloud SQL proxy because it cannot reach `sqladmin.googleapis.com`.

## Deploy

1. Build and push images with Cloud Build.
2. Update the image tags in [`service.yaml`](/home/gallison/workspace/DND_booker/deploy/cloudrun/service.yaml) if you are not deploying `latest`.
3. Confirm these values in the manifest:
   - Cloud SQL instance connection name
   - Redis host
   - `GCS_BUCKET`
   - service account
   - `CLIENT_URL`
   - `REGISTRATION_ALLOWED_EMAILS`
4. Deploy:

```bash
gcloud run services replace deploy/cloudrun/service.yaml --region="$REGION"
```

Then fetch the public URL:

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

`npm run deploy:cloudrun` wraps the safest repeatable production flow for this repo:

1. `gcloud builds submit --config deploy/cloudrun/cloudbuild.yaml --substitutions _REGION=us-west4,_REPO=dnd-booker,_TAG=<git-sha>`
2. render a temporary service manifest with that same image tag
3. `gcloud run services replace <rendered-manifest> --region=us-west4`
3. `gcloud run services describe dnd-booker --region=us-west4 --format='value(status.url)'`

`TAG` defaults to `git rev-parse --short HEAD`. Override `PROJECT_ID`, `REGION`, `REPOSITORY`, `TAG`, or `SERVICE` in the environment if you need a non-default deploy target.

If you set these before deploy, the wrapper also runs an authenticated `api/v1` smoke test after the health check:

```bash
export SMOKE_TEST_EMAIL="you@example.com"
export SMOKE_TEST_PASSWORD="your-password"
export SMOKE_TEST_PROJECT_ID="optional-project-id"
export SMOKE_TEST_GENERATION_PROMPT="optional smoke prompt override"
```

After deploy, verify:

- `curl -fsS "$URL/api/health"`
- load `"$URL/"`
- confirm the authenticated `api/v1` smoke test passed, or run `npm run smoke:cloudrun:v1` manually if you skipped it during deploy
- note that the smoke now uses `/api/v1/projects` for project discovery and creates then immediately cancels one quick generation run, so both the v1 project surface and v1 run creation/transport timestamps are exercised against production

Local ship verification should also cover the `api/v1` project and run surfaces before deploy. `npm run verify:ship` now includes `documents.v1.test.ts`, `projects.v1.test.ts`, and `runs.v1.test.ts` through the Cloud SQL Proxy + local Redis harness so project transport and run orchestration regressions are caught before production.

## Seed Templates

Create or update the seed job:

```bash
gcloud run jobs replace deploy/cloudrun/seed-job.yaml --region="$REGION"
```

Run it:

```bash
gcloud run jobs execute dnd-booker-seed --region="$REGION" --wait
```
