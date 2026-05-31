#!/usr/bin/env bash
set -euo pipefail

# Validate required secrets before touching anything
[[ -z "${QDRANT_API_KEY:-}" ]] && echo "ERROR: QDRANT_API_KEY must be set (source .env first)" && exit 1
[[ -z "${MEILI_MASTER_KEY:-}" ]] && echo "ERROR: MEILI_MASTER_KEY must be set (source .env first)" && exit 1

echo "==> Pulling latest code..."
git pull origin main

echo "==> Installing dependencies..."
npm ci

echo "==> Building API (TypeScript)..."
npm run build

echo "==> Building frontend..."
(cd web && npm ci && npm run build)

echo "==> Ensuring log directory exists..."
mkdir -p logs

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.prod.config.cjs --update-env

echo "==> Done. Status:"
pm2 status
