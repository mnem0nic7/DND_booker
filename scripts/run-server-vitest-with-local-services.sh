#!/usr/bin/env bash
set -euo pipefail

# Fully-local server integration test harness.
# Brings up the docker-compose Postgres + Redis, provisions a dedicated test
# database, runs migrations, and executes the server vitest suite against them.
# No gcloud / Cloud SQL Proxy — everything runs on the local Docker stack.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"

# Local docker-compose defaults (override via env if you customized compose).
PG_USER="${TEST_PG_USER:-dnd_booker}"
PG_PASSWORD="${TEST_PG_PASSWORD:-dnd_booker_dev}"
PG_HOST="${TEST_PG_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5433}"
TEST_DB_NAME="${TEST_DB_NAME:-dnd_booker_test}"
REDIS_HOST_LOCAL="${TEST_REDIS_HOST:-localhost}"
REDIS_PORT="${REDIS_PORT:-6380}"
TEST_REDIS_PASSWORD="${REDIS_PASSWORD:-dev-redis-password}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required for local integration tests but was not found on PATH." >&2
  exit 1
fi

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

wait_for_health() {
  local service=$1
  for _ in $(seq 1 60); do
    local status
    status="$(compose ps --format '{{.Health}}' "$service" 2>/dev/null | head -n1 || true)"
    if [[ "$status" == "healthy" ]]; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for docker service '$service' to become healthy." >&2
  compose logs --tail 30 "$service" >&2 || true
  return 1
}

echo "Starting local Postgres + Redis (docker compose)…"
REDIS_PASSWORD="$TEST_REDIS_PASSWORD" compose up -d postgres redis >/dev/null
wait_for_health postgres
wait_for_health redis

echo "Ensuring test database '$TEST_DB_NAME' exists…"
if ! compose exec -T -e PGPASSWORD="$PG_PASSWORD" postgres \
    psql -U "$PG_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$TEST_DB_NAME'" \
    | grep -qx 1; then
  compose exec -T -e PGPASSWORD="$PG_PASSWORD" postgres \
    createdb -U "$PG_USER" "$TEST_DB_NAME"
fi

export DATABASE_URL="postgresql://${PG_USER}:${PG_PASSWORD}@${PG_HOST}:${POSTGRES_PORT}/${TEST_DB_NAME}?schema=public"
export REDIS_HOST="$REDIS_HOST_LOCAL"
export REDIS_PORT="$REDIS_PORT"
export REDIS_PASSWORD="$TEST_REDIS_PASSWORD"

echo "Applying migrations to test database…"
(cd "$ROOT_DIR/server" && npx prisma migrate deploy --schema=prisma/schema.prisma >/dev/null)

echo "Running server vitest suite…"
(cd "$ROOT_DIR/server" && npm run test -- run "$@")
