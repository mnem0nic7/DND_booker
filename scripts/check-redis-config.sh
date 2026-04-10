#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-dnd-booker}"
REGION="${REGION:-us-west4}"
INSTANCE_NAME="${INSTANCE_NAME:-dnd-booker-redis}"

CONFIG_JSON="$(gcloud redis instances describe "$INSTANCE_NAME" \
  --project "$PROJECT_ID" \
  --region "$REGION" \
  --format=json)"

POLICY="$(python3 - <<'PY' "$CONFIG_JSON"
import json
import sys

payload = json.loads(sys.argv[1])
print((payload.get("redisConfigs") or {}).get("maxmemory-policy", ""))
PY
)"

if [[ "$POLICY" != "noeviction" ]]; then
  echo "Redis instance $INSTANCE_NAME in $REGION is using maxmemory-policy=${POLICY:-<unset>} (expected noeviction)." >&2
  exit 1
fi

echo "Redis instance $INSTANCE_NAME in $REGION is correctly configured with maxmemory-policy=noeviction."
