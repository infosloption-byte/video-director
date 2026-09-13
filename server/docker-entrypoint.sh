#!/bin/sh
set -e

echo "[entrypoint] Waiting for the database and applying migrations..."

attempt=0
max_attempts=30
until npx prisma migrate deploy; do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge "$max_attempts" ]; then
    echo "[entrypoint] Migrations failed after $max_attempts attempts, giving up."
    exit 1
  fi
  echo "[entrypoint] Migration attempt $attempt failed, retrying in 5s..."
  sleep 5
done

echo "[entrypoint] Migrations applied. Starting: $*"
exec "$@"
