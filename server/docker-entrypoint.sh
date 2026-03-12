#!/bin/sh
set -eu

mkdir -p /app/uploads
chown -R nodeapp:nodejs /app/uploads

exec su-exec nodeapp "$@"
