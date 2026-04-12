# Cloud Run Web/Worker Runbook

This project runs as two Cloud Run services in `us-west4`:

- `dnd-booker`: public web ingress (`client`, `server`, `cloudsql-proxy`)
- `dnd-booker-worker`: internal background worker (`worker`, `cloudsql-proxy`)

Use this runbook for first-response production incidents.

## Quick Status

```bash
gcloud run services describe dnd-booker --region us-west4
gcloud run services describe dnd-booker-worker --region us-west4
```

Readiness only tells you whether the revision is serving. It does not prove that background work is draining correctly. Always follow with the smoke flow when credentials are available:

```bash
SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... npm run smoke:cloudrun:v1
```

That smoke exercises the live `api/v1` path end to end: temp project creation, generation through publication review, resume, export, PDF download validation, and cleanup.

If the deploy touched improvement-loop orchestration or GitHub repo binding behavior, follow with:

```bash
SMOKE_TEST_EMAIL=... \
SMOKE_TEST_PASSWORD=... \
npm run smoke:cloudrun:improvement-loop
```

If production already has the default AI-team engineering target configured, the smoke can now resolve the repo/install/default-branch/allowlist automatically from `/api/v1/improvement-loops/default-engineering-target` after login.
It also validates that the completed loop appears in `/api/v1/improvement-loops/recent`, so the deployed all-projects AI-team dashboard feed is covered in production triage.

Set these only when you need to override the Cloud Run defaults:

```bash
SMOKE_IMPROVEMENT_LOOP_REPOSITORY_FULL_NAME=owner/repo \
SMOKE_IMPROVEMENT_LOOP_INSTALLATION_ID=123456 \
SMOKE_IMPROVEMENT_LOOP_DEFAULT_BRANCH=main \
SMOKE_IMPROVEMENT_LOOP_ALLOWLIST='docs/,README.md,CLAUDE.md' \
SMOKE_IMPROVEMENT_LOOP_EXPECT_APPLY=true \
npm run smoke:cloudrun:improvement-loop
```

Use a disposable or smoke-only repo binding unless you explicitly want the smoke to open a draft PR against a long-lived repository.

## Alerts

- `dnd-booker web HTTP 5xx`
  - Meaning: the public web service is returning request failures.
  - Check:
    ```bash
    gcloud logging read \
      'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker" AND logName="projects/dnd-booker/logs/run.googleapis.com%2Frequests" AND httpRequest.status>=500' \
      --project dnd-booker \
      --limit 50 \
      --freshness=30m
    ```

- `dnd-booker generation failures`
  - Meaning: a generation run failed in the worker.
  - Check:
    ```bash
    gcloud logging read \
      'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker-worker" AND textPayload=~"\\[generation\\] Run .* failed:"' \
      --project dnd-booker \
      --limit 50 \
      --freshness=30m
    ```

- `dnd-booker export failures`
  - Meaning: a PDF/export job failed in the worker.
  - Check:
    ```bash
    gcloud logging read \
      'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker-worker" AND textPayload=~"\\[export\\.job\\] Export .* failed:"' \
      --project dnd-booker \
      --limit 50 \
      --freshness=30m
    ```

- `dnd-booker ops audit violations`
  - Meaning: the always-on worker audit found stale queued runs, stale queued exports, stale BullMQ queue backlog, or stale pending interrupts.
  - Check:
    ```bash
    gcloud logging read \
      'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker-worker" AND textPayload:"OPS_AUDIT_VIOLATION"' \
      --project dnd-booker \
      --limit 50 \
      --freshness=2h
    ```
  - The JSON payload now includes per-queue backlog summaries for `generation`, `agent`, and `export`, including total queued count and oldest queued age in minutes.

- `dnd-booker worker restart churn`
  - Meaning: the worker started more than three times in fifteen minutes.
  - Check:
    ```bash
    gcloud logging read \
      'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker-worker" AND textPayload:"[worker.lifecycle] startup"' \
      --project dnd-booker \
      --limit 50 \
      --freshness=2h
    ```

## Web Down

1. Check the current revision and readiness:
   ```bash
   gcloud run services describe dnd-booker --region us-west4 --format='value(status.latestReadyRevisionName,status.traffic[0].revisionName)'
   ```
2. Read recent server logs:
   ```bash
   gcloud logging read \
     'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker"' \
     --project dnd-booker \
     --limit 100 \
     --freshness=30m
   ```
3. Re-run the acceptance smoke:
   ```bash
   BASE_URL="$(gcloud run services describe dnd-booker --region us-west4 --format='value(status.url)')" \
   SMOKE_TEST_EMAIL=... \
   SMOKE_TEST_PASSWORD=... \
   npm run smoke:cloudrun:v1
   ```
4. If the web deploy is the regression, redeploy the previous known-good commit tag.

## Worker Not Ready

1. Check service readiness:
   ```bash
   gcloud run services describe dnd-booker-worker --region us-west4 --format='value(status.latestReadyRevisionName,status.conditions)'
   ```
2. Check recent worker logs:
   ```bash
   gcloud logging read \
     'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker-worker"' \
     --project dnd-booker \
     --limit 100 \
     --freshness=30m
   ```
3. Look specifically for:
   - `[Redis] Connection error`
   - `IMPORTANT! Eviction policy is ... It should be "noeviction"`
   - `[worker.lifecycle] redis connection closed`
   - startup probe failures
   - Cloud SQL proxy connection failures
4. If this began after a deploy, redeploy the previous worker revision only.
5. Confirm Memorystore is still on the supported BullMQ policy:
   ```bash
   npm run ops:redis:check
   ```

## Worker Error Burst After Deploy

1. Confirm web is still healthy:
   ```bash
   curl -fsS "$(gcloud run services describe dnd-booker --region us-west4 --format='value(status.url)')/api/v1/health"
   ```
2. Run the full acceptance smoke, even for a worker-only deploy:
   ```bash
   SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... npm run smoke:cloudrun:v1
   ```
3. If smoke fails only on generation/export, roll back worker first.
4. If smoke fails before generation starts, inspect the web service too and consider rolling back both.

## Queue Backlog Without Hard Failure

If `dnd-booker ops audit violations` fires but the worker service is still Ready, check whether the backlog is in BullMQ rather than a crash loop:

1. Read the most recent audit payload:
   ```bash
   gcloud logging read \
     'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker-worker" AND textPayload:"OPS_AUDIT_VIOLATION"' \
     --project dnd-booker \
     --limit 5 \
     --freshness=2h \
     --format=json
   ```
2. Look at `queueBacklogs` in the JSON payload.
3. If one queue shows a growing `totalQueuedCount` with an old `oldestQueuedAgeMinutes`, rerun the authenticated smoke:
   ```bash
   SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... npm run smoke:cloudrun:v1
   ```
4. If smoke hangs in generation/export and the queue backlog keeps growing, roll back the worker revision first.
5. If the worker logs also warn about Redis eviction policy, fix Redis before treating the backlog as a pure application regression. BullMQ requires `maxmemory-policy=noeviction`.

## Rollback

Find revisions:

```bash
gcloud run revisions list --service dnd-booker --region us-west4
gcloud run revisions list --service dnd-booker-worker --region us-west4
```

Shift traffic back to a prior revision:

```bash
gcloud run services update-traffic dnd-booker \
  --region us-west4 \
  --to-revisions REVISION_NAME=100

gcloud run services update-traffic dnd-booker-worker \
  --region us-west4 \
  --to-revisions REVISION_NAME=100
```

After rollback, rerun the acceptance smoke before closing the incident.
