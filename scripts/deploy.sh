#!/usr/bin/env bash
set -euo pipefail

echo "==> Pulling latest code..."
git pull origin main

echo "==> Installing API dependencies..."
npm ci --omit=dev

echo "==> Building frontend..."
cd web
npm ci
npm run build
cd ..

echo "==> Reloading PM2 processes..."
pm2 reload ecosystem.prod.config.cjs --update-env

echo "==> Done. Status:"
pm2 status
