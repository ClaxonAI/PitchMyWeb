#!/usr/bin/env bash
# Clears migrations Prisma has recorded as failed, so `prisma migrate deploy`
# can run again. Once a migration fails, Prisma refuses every later one
# (P3009) and each deploy stops at the database step until someone repairs it
# by hand.
#
# A failed migration is repaired only when packages/db/prisma/repairs/ has a
# script for it: an idempotent version of the migration (IF NOT EXISTS
# throughout) that finishes whatever part of it did not run. The script is
# applied, then the migration is marked applied. A failed migration with no
# repair script stops the deploy with instructions; nothing is guessed.
#
# Run from the repository root with DATABASE_URL set, as the app user.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is not set}"
REPAIRS=packages/db/prisma/repairs

# psql rejects Prisma's own URL parameters (?schema=...); RDS requires TLS.
PG_URL="${DATABASE_URL%%\?*}"
export PGSSLMODE="${PGSSLMODE:-require}"
export PGCONNECT_TIMEOUT=15

has_table=$(psql "$PG_URL" -XAtq -c "select to_regclass('public._prisma_migrations') is not null")
if [ "$has_table" != "t" ]; then
  echo "no migrations recorded yet; nothing to repair"
  exit 0
fi

failed=$(psql "$PG_URL" -XAtq -c \
  "select distinct migration_name from _prisma_migrations
   where finished_at is null and rolled_back_at is null
     and not exists (select 1 from _prisma_migrations ok
                     where ok.migration_name = _prisma_migrations.migration_name
                       and ok.finished_at is not null and ok.rolled_back_at is null)
   order by 1")
if [ -z "$failed" ]; then
  echo "no failed migrations"
  exit 0
fi

for name in $failed; do
  script="$REPAIRS/$name.sql"
  if [ ! -f "$script" ]; then
    echo "Migration $name is recorded as failed and has no repair script ($script)."
    echo "Check which of its changes exist in the database, write that script"
    echo "(its statements with IF NOT EXISTS), and deploy again."
    exit 1
  fi
  echo "repairing failed migration $name"
  psql "$PG_URL" -X -v ON_ERROR_STOP=1 -q -f "$script"
  (cd packages/db && npx prisma migrate resolve --applied "$name")
done
