#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dnd-booker}"
REGION="${REGION:-us-west4}"
WORKER_SERVICE="${WORKER_SERVICE:-dnd-booker-worker}"
VALIDATION_LOG_NAME="${VALIDATION_LOG_NAME:-dnd_booker_monitoring_validation}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required to validate monitoring." >&2
  exit 1
fi

revision_name="$(
  gcloud run services describe "${WORKER_SERVICE}" \
    --project "${PROJECT_ID}" \
    --region "${REGION}" \
    --format='value(status.latestReadyRevisionName)'
)"

if [[ -z "${revision_name}" ]]; then
  echo "Unable to resolve latest ready revision for ${WORKER_SERVICE}." >&2
  exit 1
fi

message="[ops.audit] OPS_AUDIT_VIOLATION synthetic validation $(date -u +%Y-%m-%dT%H:%M:%SZ)"

gcloud logging write "${VALIDATION_LOG_NAME}" "${message}" \
  --project "${PROJECT_ID}" \
  --severity=ERROR \
  --monitored-resource-type=cloud_run_revision \
  --monitored-resource-labels="project_id=${PROJECT_ID},service_name=${WORKER_SERVICE},revision_name=${revision_name},location=${REGION},configuration_name=${WORKER_SERVICE}" >/dev/null

echo "Wrote synthetic worker ops-audit violation log for ${WORKER_SERVICE} (${revision_name})."
echo "Use Cloud Monitoring to confirm the 'dnd-booker ops audit violations' policy opened an incident."
