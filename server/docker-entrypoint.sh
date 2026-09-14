#!/bin/sh
set -e

# Prisma needs a single DATABASE_URL, but this deployment is configured via
# discrete DB_* vars (to match the shared-MySQL pattern used by the other
# projects on this box, e.g. voxora). Build the URL from those unless
# DATABASE_URL was already set explicitly.
if [ -z "$DATABASE_URL" ]; then
  DB_CONNECTION="${DB_CONNECTION:-mysql}"
  DB_HOST="${DB_HOST:-mysql_shared}"
  DB_PORT="${DB_PORT:-3306}"
  DB_DATABASE="${DB_DATABASE:-helix}"
  DB_USERNAME="${DB_USERNAME:-root}"
  DB_PASSWORD="${DB_PASSWORD:-}"
  export DATABASE_URL="${DB_CONNECTION}://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_DATABASE}"
fi

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
