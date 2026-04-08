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
  - Meaning: the always-on worker audit found stale queued runs, stale queued exports, or stale pending interrupts.
  - Check:
    ```bash
    gcloud logging read \
      'resource.type="cloud_run_revision" AND resource.labels.service_name="dnd-booker-worker" AND textPayload:"OPS_AUDIT_VIOLATION"' \
      --project dnd-booker \
      --limit 50 \
      --freshness=2h
    ```

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
   BASE_URL=https://dnd-booker-npbu4x44pq-wn.a.run.app \
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
   - `[worker.lifecycle] redis connection closed`
   - startup probe failures
   - Cloud SQL proxy connection failures
4. If this began after a deploy, redeploy the previous worker revision only.

## Worker Error Burst After Deploy

1. Confirm web is still healthy:
   ```bash
   curl -fsS https://dnd-booker-npbu4x44pq-wn.a.run.app/api/v1/health
   ```
2. Run the full acceptance smoke, even for a worker-only deploy:
   ```bash
   SMOKE_TEST_EMAIL=... SMOKE_TEST_PASSWORD=... npm run smoke:cloudrun:v1
   ```
3. If smoke fails only on generation/export, roll back worker first.
4. If smoke fails before generation starts, inspect the web service too and consider rolling back both.

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
