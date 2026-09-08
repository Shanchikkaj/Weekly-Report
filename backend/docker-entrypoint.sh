#!/bin/sh
set -e

echo "[Docker Entrypoint] Ensuring PostgreSQL schema is up to date..."
npx prisma db push --skip-generate

echo "[Docker Entrypoint] Starting Weekly Report Backend API..."
exec node --dns-result-order=ipv4first dist/index.js
