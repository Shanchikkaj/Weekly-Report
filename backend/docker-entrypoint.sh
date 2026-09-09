#!/bin/sh
set -e

echo "[Docker Entrypoint] Running production database migrations (prisma migrate deploy)..."
npx prisma migrate deploy

echo "[Docker Entrypoint] Starting Weekly Report Backend API..."
exec node --dns-result-order=ipv4first dist/index.js
