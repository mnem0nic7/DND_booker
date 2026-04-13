#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dnd-booker}"
REGION="${REGION:-us-west4}"
REPOSITORY="${REPOSITORY:-dnd-booker}"
TAG="${TAG:-$(git rev-parse --short HEAD)}"
WEB_SERVICE="${WEB_SERVICE:-dnd-booker}"
WORKER_SERVICE="${WORKER_SERVICE:-dnd-booker-worker}"
DEPLOY_TARGET="${DEPLOY_TARGET:-all}"
WORKER_STABILIZATION_SECONDS="${WORKER_STABILIZATION_SECONDS:-90}"
TEMP_WEB_SERVICE_YAML="$(mktemp)"
TEMP_WORKER_SERVICE_YAML="$(mktemp)"

cleanup() {
  rm -f "${TEMP_WEB_SERVICE_YAML}" "${TEMP_WORKER_SERVICE_YAML}"
}

trap cleanup EXIT

echo "Using project=${PROJECT_ID} region=${REGION} repo=${REPOSITORY} tag=${TAG} web=${WEB_SERVICE} worker=${WORKER_SERVICE} target=${DEPLOY_TARGET}"
if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required for Cloud Run redeploys." >&2
  exit 1
fi

gcloud config set project "${PROJECT_ID}" >/dev/null

gcloud builds submit \
  --config deploy/cloudrun/cloudbuild.yaml \
  --substitutions "_REGION=${REGION},_REPO=${REPOSITORY},_TAG=${TAG}"

WEB_SERVICE_URL="$(
gcloud run services describe "${WEB_SERVICE}" \
  --project "${PROJECT_ID}" \
  --region "${REGION}" \
  --format='value(status.url)'
)"

if [[ "${DEPLOY_TARGET}" == "all" || "${DEPLOY_TARGET}" == "web" ]]; then
  sed \
    -e "s|dnd-booker-client:latest|dnd-booker-client:${TAG}|g" \
    -e "s|dnd-booker-server:latest|dnd-booker-server:${TAG}|g" \
    deploy/cloudrun/service.yaml > "${TEMP_WEB_SERVICE_YAML}"

  gcloud run services replace "${TEMP_WEB_SERVICE_YAML}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}"

  WEB_SERVICE_URL="$(
  gcloud run services describe "${WEB_SERVICE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --format='value(status.url)'
  )"
fi

if [[ "${DEPLOY_TARGET}" == "all" || "${DEPLOY_TARGET}" == "worker" ]]; then
  sed \
    -e "s|dnd-booker-worker:latest|dnd-booker-worker:${TAG}|g" \
    -e "s|__WEB_SERVICE_URL__|${WEB_SERVICE_URL}|g" \
    deploy/cloudrun/worker-service.yaml > "${TEMP_WORKER_SERVICE_YAML}"

  gcloud run services replace "${TEMP_WORKER_SERVICE_YAML}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}"
fi

if [[ "${DEPLOY_TARGET}" == "all" || "${DEPLOY_TARGET}" == "worker" ]]; then
  WORKER_READY="$(
  gcloud run services describe "${WORKER_SERVICE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --format=json \
    | node -e '
        let raw = "";
        process.stdin.setEncoding("utf8");
        process.stdin.on("data", (chunk) => { raw += chunk; });
        process.stdin.on("end", () => {
          const service = JSON.parse(raw);
          const ready = (service.status?.conditions ?? []).find((condition) => condition.type === "Ready");
          console.log(ready?.status ?? "");
        });
      '
  )"

  if [[ "${WORKER_READY}" != "True" ]]; then
    echo "Worker service is not ready." >&2
    exit 1
  fi

  if [[ "${WORKER_STABILIZATION_SECONDS}" =~ ^[0-9]+$ ]] && [[ "${WORKER_STABILIZATION_SECONDS}" -gt 0 ]]; then
    echo "Waiting ${WORKER_STABILIZATION_SECONDS}s for old worker revisions to drain before smoke..."
    sleep "${WORKER_STABILIZATION_SECONDS}"
  fi
fi

echo "Web service URL: ${WEB_SERVICE_URL}"
curl -fsS "${WEB_SERVICE_URL}/api/v1/health"
echo

if [[ "${DEPLOY_TARGET}" == "worker" ]]; then
  echo "Worker service updated and ready."
fi
echo

if [[ -n "${SMOKE_TEST_EMAIL:-}" && -n "${SMOKE_TEST_PASSWORD:-}" ]]; then
  echo "Running authenticated api/v1 acceptance smoke..."
  BASE_URL="${WEB_SERVICE_URL}" node ./scripts/smoke-cloudrun-v1.mjs
else
  echo "Skipping authenticated api/v1 smoke test; set SMOKE_TEST_EMAIL and SMOKE_TEST_PASSWORD to enable it."
fi
