#!/bin/sh
set -eu

echo "→ Mandate boot"
echo "  NODE_ENV=${NODE_ENV:-}"
echo "  PORT=${PORT:-8788}"
echo "  DATABASE_URL=${DATABASE_URL:+set}"
echo "  ENCRYPTION_KEY=${ENCRYPTION_KEY:+set}"
echo "  CLERK_SECRET_KEY=${CLERK_SECRET_KEY:+set}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "FATAL: DATABASE_URL is not set. Add a Postgres plugin and link DATABASE_URL to this service."
  exit 1
fi

if [ -z "${ENCRYPTION_KEY:-}" ] || [ "${#ENCRYPTION_KEY}" -lt 32 ]; then
  echo "FATAL: ENCRYPTION_KEY must be set (32+ characters) in service variables."
  exit 1
fi

for name in CLERK_SECRET_KEY CLERK_PUBLISHABLE_KEY CLERK_WEBHOOK_SIGNING_SECRET; do
  eval "value=\${$name:-}"
  if [ -z "$value" ]; then
    echo "FATAL: $name must be set in service variables."
    exit 1
  fi
done

# Ensure Railway (and friends) always have a bindable PORT
export PORT="${PORT:-8788}"

echo "→ Running Prisma migrations (retrying until Postgres is ready)…"
i=0
until npx prisma migrate deploy; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "FATAL: prisma migrate deploy failed after 30 attempts."
    echo "       Check DATABASE_URL points at the Railway Postgres plugin."
    exit 1
  fi
  echo "  waiting for database… ($i/30)"
  sleep 2
done

echo "→ Starting Mandate on 0.0.0.0:${PORT}"
# Force unbuffered logs so Railway shows startup immediately
export NODE_OPTIONS="${NODE_OPTIONS:-} --trace-uncaught"
exec node server/dist/index.js
