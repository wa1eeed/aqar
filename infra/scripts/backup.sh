#!/usr/bin/env bash
# منزلة — نسخ احتياطي لقاعدة البيانات (pg_dump -Fc) مع تشفير age ورفع إلى R2.
# cron يومي 02:00 (docs/10 §4). المتغيّرات من البيئة / infra/.env.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL مطلوب}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
WORK="$(mktemp -d)"
DUMP="$WORK/manzilah-$STAMP.dump"
trap 'rm -rf "$WORK"' EXIT

echo "→ pg_dump…"
pg_dump -Fc --no-owner --no-privileges "$DATABASE_URL" -f "$DUMP"

OUT="$DUMP"
if [[ -n "${BACKUP_AGE_RECIPIENT:-}" ]] && command -v age >/dev/null 2>&1; then
  echo "→ تشفير age…"
  age -r "$BACKUP_AGE_RECIPIENT" -o "$DUMP.age" "$DUMP"
  OUT="$DUMP.age"
fi

if [[ -n "${R2_BUCKET_BACKUPS:-}" ]] && command -v rclone >/dev/null 2>&1; then
  echo "→ رفع إلى R2…"
  rclone copy "$OUT" "r2:$R2_BUCKET_BACKUPS/backups/" --s3-no-check-bucket
  echo "✓ رُفع: $(basename "$OUT")"
else
  DEST="${BACKUP_DIR:-/var/backups/manzilah}"
  mkdir -p "$DEST"; cp "$OUT" "$DEST/"
  echo "✓ حُفظ محلياً: $DEST/$(basename "$OUT")"
fi
