#!/usr/bin/env bash
# Clean-room run of the Spell release E2E: a brand-new LOCAL PostgreSQL cluster → every Prisma migration → production build check → the real-HTTP + real-DB E2E.
# Needs PostgreSQL server binaries (default /usr/lib/postgresql/16/bin) and a production build (`npm run build`). Never touches any non-local database.
#   scripts/e2e/run-spell-e2e.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${E2E_PG_PORT:-54330}"
DIR="$(mktemp -d /tmp/spell-e2e-pg.XXXXXX)"
if [ "$(id -u)" = "0" ]; then chown postgres:postgres "$DIR"; AS=(su postgres -c); else AS=(bash -c); fi
cleanup() { "${AS[@]}" "$PGBIN/pg_ctl -D $DIR/data -m immediate stop >/dev/null 2>&1 || true"; rm -rf "$DIR"; }
trap cleanup EXIT
"${AS[@]}" "$PGBIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
"${AS[@]}" "$PGBIN/pg_ctl -D $DIR/data -o '-p $PORT -k $DIR -c listen_addresses=127.0.0.1' -l $DIR/pg.log -w start >/dev/null"
"$PGBIN/createdb" -h 127.0.0.1 -p "$PORT" -U postgres tore_spell_e2e
export DATABASE_URL="postgresql://postgres@127.0.0.1:$PORT/tore_spell_e2e"
echo "== migrations on an EMPTY database"; npx prisma migrate deploy 2>&1 | tail -2
echo "== schema state";                    npx prisma migrate status 2>&1 | tail -2
echo "== E2E";                              npx tsx scripts/e2e/spell-release-e2e.ts
