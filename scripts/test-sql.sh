#!/usr/bin/env bash
# Plain-Postgres SQL tests: the Supabase stand-ins, then the schema (the
# migrations once they exist), then every test file. Connection comes from the
# PG* environment variables; the defaults are the cloud session's harness.
set -euo pipefail
cd "$(dirname "$0")/.."

export PGHOST="${PGHOST:-/var/lib/postgresql/rosdata}"
export PGPORT="${PGPORT:-54329}"
export PGUSER="${PGUSER:-postgres}"
DB="${SQL_TEST_DB:-ros_test}"

# Start the local harness cluster if this is the cloud session and it's down.
if [ "$PGHOST" = "/var/lib/postgresql/rosdata" ] && ! pg_isready -q; then
  PGBIN=$(ls -d /usr/lib/postgresql/*/bin | tail -1)
  su postgres -c "$PGBIN/pg_ctl -D /var/lib/postgresql/rosdata/data -o '-p $PGPORT -k $PGHOST' -l /var/lib/postgresql/rosdata/log.txt start" >/dev/null
  for _ in $(seq 1 20); do pg_isready -q && break; sleep 0.5; done
fi

psql -qtA -d postgres -c "drop database if exists $DB" -c "create database $DB" >/dev/null

run() {
  echo "== $1"
  psql -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1"
}

run docs/01-architecture/sql/00-supabase-stubs.sql

shopt -s nullglob
migrations=(supabase/migrations/*.sql)
if [ ${#migrations[@]} -eq 0 ]; then
  run docs/01-architecture/sql/10-schema.sql
else
  for f in "${migrations[@]}"; do run "$f"; done
fi

for f in docs/01-architecture/sql/90-smoke-test.sql supabase/tests/sql/*.sql; do
  run "$f"
done
echo "SQL tests passed"
