#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dnd-booker}"
REGION="${REGION:-us-west4}"
REPOSITORY="${REPOSITORY:-dnd-booker}"
TAG="${TAG:-latest}"
SERVICE="${SERVICE:-dnd-booker}"

echo "Using project=${PROJECT_ID} region=${REGION} repo=${REPOSITORY} tag=${TAG} service=${SERVICE}"
if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required for Cloud Run redeploys." >&2
  exit 1
fi

gcloud config set project "${PROJECT_ID}" >/dev/null

gcloud builds submit \
  --config deploy/cloudrun/cloudbuild.yaml \
  --substitutions "_REGION=${REGION},_REPO=${REPOSITORY},_TAG=${TAG}"

gcloud run services replace deploy/cloudrun/service.yaml \
  --project "${PROJECT_ID}" \
  --region "${REGION}"

SERVICE_URL="$(
gcloud run services describe "${SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format='value(status.url)'
)"

echo "Service URL: ${SERVICE_URL}"
curl -fsS "${SERVICE_URL}/api/health"
echo

if [[ -n "${SMOKE_TEST_EMAIL:-}" && -n "${SMOKE_TEST_PASSWORD:-}" ]]; then
  echo "Running authenticated api/v1 smoke test..."
  BASE_URL="${SERVICE_URL}" node ./scripts/smoke-cloudrun-v1.mjs
else
  echo "Skipping authenticated api/v1 smoke test; set SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD to enable it."
fi
