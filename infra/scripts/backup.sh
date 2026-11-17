#!/usr/bin/env bash
# Nightly encrypted database backup (docs/10 §4). Run from the host cron at 02:00 Asia/Riyadh:
#   0 2 * * * /opt/nx/infra/scripts/backup.sh >> /var/log/nx-backup.log 2>&1
#
# Requires on the host: docker, age (https://age-encryption.org), and optionally the AWS CLI for
# uploading to the private R2 bucket. Configuration (environment or infra/.env):
#   BACKUP_AGE_RECIPIENT   age public key (age1…) — the private key is kept OFF the server
#   BACKUP_DIR             local directory for backups (default /var/backups/nx)
#   R2_BACKUP_BUCKET       optional: R2 bucket for off-site copies (e.g. nx-backups)
#   R2_ENDPOINT            optional: https://<accountid>.r2.cloudflarestorage.com
#   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY   optional: R2 credentials for the upload
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" --env-file "$ENV_FILE")
BACKUP_DIR="${BACKUP_DIR:-/var/backups/nx}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (age public key)}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/nx-$stamp.dump.age"

# pg_dump runs inside the postgres container; the dump is encrypted before it touches the disk.
"${COMPOSE[@]}" exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB"' |
  age -r "$BACKUP_AGE_RECIPIENT" -o "$file"
echo "[backup] wrote $file ($(du -h "$file" | cut -f1))"

if [[ -n "${R2_BACKUP_BUCKET:-}" && -n "${R2_ENDPOINT:-}" ]]; then
  prefix="daily"
  [[ "$(date -u +%d)" == "01" ]] && prefix="monthly"
  aws s3 cp "$file" "s3://$R2_BACKUP_BUCKET/backups/$prefix/$(basename "$file")" --endpoint-url "$R2_ENDPOINT" --only-show-errors
  echo "[backup] uploaded to r2://$R2_BACKUP_BUCKET/backups/$prefix/"
fi

# Local retention: 30 daily files (R2 lifecycle rules keep 30 daily + 12 monthly).
find "$BACKUP_DIR" -name 'nx-*.dump.age' -type f -mtime +30 -delete
