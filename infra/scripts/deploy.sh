#!/usr/bin/env bash
# Deploy on a plain VPS (when not using Coolify): pull the latest code, rebuild, migrate, restart,
# then smoke-test /api/v1/health (docs/10 §3). Run from the repository checkout on the server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" --env-file "$ENV_FILE")
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE (copy infra/.env.example)"; exit 1; }

git -C "$REPO" pull --ff-only
"${COMPOSE[@]}" build
# `migrate` runs prisma migrate deploy + the idempotent seed before api/worker start.
"${COMPOSE[@]}" up -d --remove-orphans

for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T caddy wget -qO- http://127.0.0.1:80/api/v1/health >/dev/null 2>&1; then
    echo "[deploy] healthy"
    exit 0
  fi
  sleep 3
done
echo "[deploy] health check failed — recent API logs:"
"${COMPOSE[@]}" logs --tail 50 api
exit 1
