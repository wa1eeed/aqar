#!/usr/bin/env bash
# عقار أونلاين — استعادة قاعدة البيانات من نسخة. استخدام: restore.sh <ملف.dump[.age]>
# ⚠️ يستبدل بيانات القاعدة الهدف. شغّل اختبار الاستعادة أسبوعياً في قاعدة مؤقّتة (docs/10 §4).
set -euo pipefail

FILE="${1:?مرّر ملف النسخة الاحتياطية}"
: "${DATABASE_URL:?DATABASE_URL مطلوب (الهدف)}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

DUMP="$FILE"
if [[ "$FILE" == *.age ]]; then
  : "${BACKUP_AGE_IDENTITY:?مفتاح age للفكّ مطلوب}"
  DUMP="$WORK/restore.dump"
  age -d -i "$BACKUP_AGE_IDENTITY" -o "$DUMP" "$FILE"
fi

echo "→ pg_restore إلى الهدف…"
pg_restore --clean --if-exists --no-owner --no-privileges -d "$DATABASE_URL" "$DUMP"
echo "✓ اكتملت الاستعادة."
