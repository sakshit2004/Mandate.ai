#!/bin/sh
set -eu

echo "→ Running Prisma migrations…"
npx prisma migrate deploy

echo "→ Starting Mandate on :${PORT:-8788}"
exec node server/dist/index.js
