#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dnd-booker}"
REGION="${REGION:-us-west4}"
WEB_SERVICE="${WEB_SERVICE:-dnd-booker}"
WORKER_SERVICE="${WORKER_SERVICE:-dnd-booker-worker}"
NOTIFICATION_CHANNELS="${NOTIFICATION_CHANNELS:-}"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "${TMP_DIR}"
}

trap cleanup EXIT

notification_channels_json="$(
  node -e '
    const raw = process.argv[1] ?? "";
    const values = raw.split(",").map((value) => value.trim()).filter(Boolean);
    process.stdout.write(JSON.stringify(values));
  ' "${NOTIFICATION_CHANNELS}"
)"

upsert_log_metric() {
  local metric_name="$1"
  local description="$2"
  local log_filter="$3"

  if gcloud logging metrics describe "${metric_name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    gcloud logging metrics update "${metric_name}" \
      --project "${PROJECT_ID}" \
      --description "${description}" \
      --log-filter "${log_filter}" >/dev/null
  else
    gcloud logging metrics create "${metric_name}" \
      --project "${PROJECT_ID}" \
      --description "${description}" \
      --log-filter "${log_filter}" >/dev/null
  fi
}

delete_policy_by_display_name() {
  local display_name="$1"
  local existing

  existing="$(
    gcloud alpha monitoring policies list \
      --project "${PROJECT_ID}" \
      --format='value(name)' \
      --filter="displayName=\"${display_name}\""
  )"

  if [[ -z "${existing}" ]]; then
    return
  fi

  while IFS= read -r policy_name; do
    [[ -z "${policy_name}" ]] && continue
    gcloud alpha monitoring policies delete "${policy_name}" \
      --project "${PROJECT_ID}" \
      --quiet >/dev/null
  done <<< "${existing}"
}

write_matched_log_policy() {
  local file_path="$1"
  local display_name="$2"
  local condition_display_name="$3"
  local log_filter="$4"
  local documentation="$5"

  cat > "${file_path}" <<EOF
displayName: ${display_name}
combiner: OR
enabled: true
notificationChannels: ${notification_channels_json}
alertStrategy:
  notificationRateLimit:
    period: 300s
  autoClose: 1800s
documentation:
  content: |-
$(printf '%s\n' "${documentation}" | sed 's/^/    /')
  mimeType: text/markdown
conditions:
  - displayName: ${condition_display_name}
    conditionMatchedLog:
      filter: >-
        ${log_filter}
EOF
}

write_metric_threshold_policy() {
  local file_path="$1"
  local display_name="$2"
  local condition_display_name="$3"
  local metric_filter="$4"
  local threshold_value="$5"
  local documentation="$6"

  cat > "${file_path}" <<EOF
displayName: ${display_name}
combiner: OR
enabled: true
notificationChannels: ${notification_channels_json}
alertStrategy:
  notificationRateLimit:
    period: 900s
  autoClose: 1800s
documentation:
  content: |-
$(printf '%s\n' "${documentation}" | sed 's/^/    /')
  mimeType: text/markdown
conditions:
  - displayName: ${condition_display_name}
    conditionThreshold:
      filter: >-
        ${metric_filter}
      aggregations:
        - alignmentPeriod: 900s
          perSeriesAligner: ALIGN_SUM
      comparison: COMPARISON_GT
      thresholdValue: ${threshold_value}
      duration: 0s
      trigger:
        count: 1
EOF
}

apply_policy() {
  local display_name="$1"
  local file_path="$2"
  delete_policy_by_display_name "${display_name}"
  gcloud alpha monitoring policies create \
    --project "${PROJECT_ID}" \
    --policy-from-file "${file_path}" >/dev/null
}

echo "Installing Cloud Run monitoring for project=${PROJECT_ID} region=${REGION} web=${WEB_SERVICE} worker=${WORKER_SERVICE}"

upsert_log_metric \
  dnd_booker_worker_startups \
  "Counts worker startup logs for Cloud Run restart-churn alerting." \
  "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${WORKER_SERVICE}\" textPayload:\"[worker.lifecycle] startup\""

write_matched_log_policy \
  "${TMP_DIR}/web-http-5xx.yaml" \
  "dnd-booker web HTTP 5xx" \
  "Cloud Run request log 5xx" \
  "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${WEB_SERVICE}\" logName=\"projects/${PROJECT_ID}/logs/run.googleapis.com%2Frequests\" httpRequest.status>=500" \
  "The web service is returning HTTP 5xx responses. Check \`${WEB_SERVICE}\` request logs and recent deploy changes."
apply_policy "dnd-booker web HTTP 5xx" "${TMP_DIR}/web-http-5xx.yaml"

write_matched_log_policy \
  "${TMP_DIR}/generation-failures.yaml" \
  "dnd-booker generation failures" \
  "Generation run failure log" \
  "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${WORKER_SERVICE}\" textPayload=~\"\\\\[generation\\\\] Run .* failed:\" OR textPayload=~\"\\\\[worker.generation\\\\] job .* failed:\" " \
  "A generation run failed in the worker service. Inspect worker logs, BullMQ retries, and persisted graph state before retrying the run."
apply_policy "dnd-booker generation failures" "${TMP_DIR}/generation-failures.yaml"

write_matched_log_policy \
  "${TMP_DIR}/export-failures.yaml" \
  "dnd-booker export failures" \
  "Export job failure log" \
  "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${WORKER_SERVICE}\" textPayload=~\"\\\\[export\\\\.job\\\\] Export .* failed:\" OR textPayload=~\"\\\\[worker.export\\\\] job .* failed:\" " \
  "An export failed in the worker service. Inspect Typst render logs, staged assets, and the export review payload."
apply_policy "dnd-booker export failures" "${TMP_DIR}/export-failures.yaml"

write_matched_log_policy \
  "${TMP_DIR}/ops-audit-violations.yaml" \
  "dnd-booker ops audit violations" \
  "Runtime audit violation log" \
  "resource.type=\"cloud_run_revision\" resource.labels.service_name=\"${WORKER_SERVICE}\" textPayload:\"OPS_AUDIT_VIOLATION\"" \
  "The runtime audit detected stale queued work or stale pending interrupts. Inspect worker logs and unblock or cancel the affected runs."
apply_policy "dnd-booker ops audit violations" "${TMP_DIR}/ops-audit-violations.yaml"

write_metric_threshold_policy \
  "${TMP_DIR}/worker-restart-churn.yaml" \
  "dnd-booker worker restart churn" \
  "Worker startups > 3 in 15m" \
  "metric.type=\"logging.googleapis.com/user/dnd_booker_worker_startups\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${WORKER_SERVICE}\"" \
  "3" \
  "The worker service restarted more than three times in fifteen minutes. Check revision health, startup probe failures, and recent deploys."
apply_policy "dnd-booker worker restart churn" "${TMP_DIR}/worker-restart-churn.yaml"

echo "Cloud Monitoring policies installed."
