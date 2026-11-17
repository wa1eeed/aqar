#!/usr/bin/env bash
# Restore an encrypted backup produced by backup.sh (docs/10 §4).
#   infra/scripts/restore.sh /path/nx-20261117T020000Z.dump.age /path/to/age-private-key.txt [--into-temp]
#
# --into-temp  restore into a throw-away database "nx_restore_test" (weekly restore test) and print
#              row counts; production data is not touched.
# Without it   the production database is REPLACED. API and worker are stopped during the restore.
set -euo pipefail

backup="${1:?usage: restore.sh <backup.dump.age> <age-key-file> [--into-temp]}"
key="${2:?usage: restore.sh <backup.dump.age> <age-key-file> [--into-temp]}"
mode="${3:-}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
COMPOSE=(docker compose -f "$ROOT/docker-compose.yml" --env-file "$ENV_FILE")

if [[ "$mode" == "--into-temp" ]]; then
  "${COMPOSE[@]}" exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" --if-exists nx_restore_test && createdb -U "$POSTGRES_USER" nx_restore_test'
  age -d -i "$key" "$backup" | "${COMPOSE[@]}" exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d nx_restore_test --no-owner --exit-on-error'
  "${COMPOSE[@]}" exec -T postgres sh -c \
    'psql -U "$POSTGRES_USER" -d nx_restore_test -Atc "SELECT '\''properties='\'' || count(*) FROM \"Property\" UNION ALL SELECT '\''bookings='\'' || count(*) FROM \"Booking\" UNION ALL SELECT '\''payments='\'' || count(*) FROM \"Payment\""'
  "${COMPOSE[@]}" exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" nx_restore_test'
  echo "[restore] test restore OK"
  exit 0
fi

read -r -p "This REPLACES the production database. Type the database name to continue: " answer
db="$("${COMPOSE[@]}" exec -T postgres sh -c 'printf %s "$POSTGRES_DB"')"
[[ "$answer" == "$db" ]] || { echo "aborted"; exit 1; }

"${COMPOSE[@]}" stop api worker
age -d -i "$key" "$backup" | "${COMPOSE[@]}" exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --exit-on-error'
"${COMPOSE[@]}" start api worker
echo "[restore] production database restored from $(basename "$backup")"
