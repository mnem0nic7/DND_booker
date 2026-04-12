#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dnd-booker}"
APP_ID_SECRET_NAME="${APP_ID_SECRET_NAME:-dnd-booker-github-app-id}"
PRIVATE_KEY_SECRET_NAME="${PRIVATE_KEY_SECRET_NAME:-dnd-booker-github-app-private-key}"
APP_ID_VALUE="${GITHUB_APP_ID_VALUE:-${GITHUB_APP_ID:-}}"
PRIVATE_KEY_VALUE="${GITHUB_APP_PRIVATE_KEY_VALUE:-${GITHUB_APP_PRIVATE_KEY:-}}"
PRIVATE_KEY_PATH="${GITHUB_APP_PRIVATE_KEY_PATH:-}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required to configure Cloud Run GitHub App secrets." >&2
  exit 1
fi

if [[ -n "${PRIVATE_KEY_PATH}" ]]; then
  if [[ ! -f "${PRIVATE_KEY_PATH}" ]]; then
    echo "Private key file not found: ${PRIVATE_KEY_PATH}" >&2
    exit 1
  fi
  PRIVATE_KEY_VALUE="$(cat "${PRIVATE_KEY_PATH}")"
fi

if [[ -z "${APP_ID_VALUE}" ]]; then
  echo "Set GITHUB_APP_ID_VALUE (or GITHUB_APP_ID) before running this script." >&2
  exit 1
fi

if [[ -z "${PRIVATE_KEY_VALUE}" ]]; then
  echo "Set GITHUB_APP_PRIVATE_KEY_VALUE, GITHUB_APP_PRIVATE_KEY, or GITHUB_APP_PRIVATE_KEY_PATH before running this script." >&2
  exit 1
fi

upsert_secret() {
  local secret_name="$1"
  local secret_value="$2"

  if gcloud secrets describe "${secret_name}" --project "${PROJECT_ID}" >/dev/null 2>&1; then
    printf '%s' "${secret_value}" | gcloud secrets versions add "${secret_name}" \
      --project "${PROJECT_ID}" \
      --data-file=-
  else
    printf '%s' "${secret_value}" | gcloud secrets create "${secret_name}" \
      --project "${PROJECT_ID}" \
      --replication-policy="automatic" \
      --data-file=-
  fi
}

gcloud config set project "${PROJECT_ID}" >/dev/null

upsert_secret "${APP_ID_SECRET_NAME}" "${APP_ID_VALUE}"
upsert_secret "${PRIVATE_KEY_SECRET_NAME}" "${PRIVATE_KEY_VALUE}"

cat <<EOF
Configured Cloud Run GitHub App secrets in project ${PROJECT_ID}.

Next deploy with:
  CLOUDRUN_GITHUB_APP_ID_SECRET=${APP_ID_SECRET_NAME}
  CLOUDRUN_GITHUB_APP_PRIVATE_KEY_SECRET=${PRIVATE_KEY_SECRET_NAME}
  DEFAULT_ENGINEERING_INSTALLATION_ID=<real_installation_id>
  npm run deploy:cloudrun
EOF
