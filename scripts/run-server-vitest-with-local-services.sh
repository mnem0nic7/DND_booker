#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$ROOT_DIR/tmp/test-services"
PROXY_BIN="$TMP_DIR/cloud-sql-proxy"
REDIS_LOG="$TMP_DIR/redis.log"
PROXY_LOG="$TMP_DIR/cloud-sql-proxy.log"
INSTANCE_CONNECTION_NAME="${INSTANCE_CONNECTION_NAME:-dnd-booker:us-west4:dnd-booker-db}"
TEST_DB_NAME="${TEST_DB_NAME:-dnd_booker_test}"
REDIS_PORT="${REDIS_PORT:-6380}"
POSTGRES_PORT="${POSTGRES_PORT:-5433}"

mkdir -p "$TMP_DIR"

cleanup() {
  local exit_code=$?
  if [[ -n "${REDIS_PID:-}" ]] && kill -0 "$REDIS_PID" 2>/dev/null; then
    kill "$REDIS_PID" 2>/dev/null || true
    wait "$REDIS_PID" 2>/dev/null || true
  fi
  if [[ -n "${PROXY_PID:-}" ]] && kill -0 "$PROXY_PID" 2>/dev/null; then
    kill "$PROXY_PID" 2>/dev/null || true
    wait "$PROXY_PID" 2>/dev/null || true
  fi
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

wait_for_port() {
  local host=$1
  local port=$2
  local name=$3
  for _ in $(seq 1 60); do
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $name on $host:$port" >&2
  return 1
}

if [[ ! -x "$PROXY_BIN" ]]; then
  curl -fsSL "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.18.2/cloud-sql-proxy.linux.amd64" -o "$PROXY_BIN"
  chmod +x "$PROXY_BIN"
fi

if ! gcloud sql databases list --instance dnd-booker-db --project dnd-booker --format='value(name)' | grep -qx "$TEST_DB_NAME"; then
  gcloud sql databases create "$TEST_DB_NAME" --instance dnd-booker-db --project dnd-booker >/dev/null
fi

REDISMS_DISABLE_POSTINSTALL=true REDISMS_PORT="$REDIS_PORT" npx --yes redis-memory-server@"0.16.0" >"$REDIS_LOG" 2>&1 &
REDIS_PID=$!
wait_for_port 127.0.0.1 "$REDIS_PORT" "Redis"

"$PROXY_BIN" --port "$POSTGRES_PORT" "$INSTANCE_CONNECTION_NAME" >"$PROXY_LOG" 2>&1 &
PROXY_PID=$!
wait_for_port 127.0.0.1 "$POSTGRES_PORT" "Cloud SQL Proxy"

TEST_DATABASE_URL="$(
  gcloud secrets versions access latest --secret=dnd-booker-database-url --project dnd-booker \
  | node -e '
      let raw = "";
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk) => { raw += chunk; });
      process.stdin.on("end", () => {
        const url = new URL(raw.trim());
        url.hostname = "127.0.0.1";
        url.port = process.env.POSTGRES_PORT || "5433";
        url.pathname = `/${process.env.TEST_DB_NAME || "dnd_booker_test"}`;
        console.log(url.toString());
      });
    '
)"

export DATABASE_URL="$TEST_DATABASE_URL"
export REDIS_HOST="127.0.0.1"
export REDIS_PORT="$REDIS_PORT"
unset REDIS_PASSWORD

(cd "$ROOT_DIR/server" && npx prisma migrate deploy --schema=prisma/schema.prisma >/dev/null)
(cd "$ROOT_DIR/server" && npm run test -- run "$@")
