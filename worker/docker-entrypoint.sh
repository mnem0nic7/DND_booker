#!/bin/sh
set -eu

mkdir -p /app/worker/output
chown -R nodeapp:nodejs /app/worker/output

exec su-exec nodeapp "$@"
