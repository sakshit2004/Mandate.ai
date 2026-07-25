#!/bin/sh
set -eu

echo "→ Mandate boot"
echo "  NODE_ENV=${NODE_ENV:-}"
echo "  PORT=${PORT:-8788}"
echo "  DATABASE_URL=${DATABASE_URL:+set}"
echo "  SESSION_SECRET=${SESSION_SECRET:+set}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL is not set. Add a Postgres plugin and link it to this service."
  exit 1
fi

if [ -z "${SESSION_SECRET:-}" ] || [ "${#SESSION_SECRET}" -lt 16 ]; then
  echo "FATAL: SESSION_SECRET must be set (16+ characters) in Railway Variables."
  exit 1
fi

echo "→ Running Prisma migrations (retrying until Postgres is ready)…"
i=0
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "FATAL: prisma migrate deploy failed after 30 attempts."
    exit 1
  fi
  echo "  waiting for database… ($i/30)"
  sleep 2
done

echo "→ Starting Mandate on 0.0.0.0:${PORT:-8788}"
exec node server/dist/index.js
