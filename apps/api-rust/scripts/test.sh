#!/usr/bin/env bash
# Runs the test suite against a throwaway Postgres.
#
# The integration tests create a database per test, so they need a server
# they may create databases on. With TEST_DATABASE_URL set, that server is
# used as-is (CI does this with a service container). Otherwise this starts a
# temporary cluster with the local Postgres binaries and removes it on exit.
#
# Usage: scripts/test.sh [cargo test arguments...]
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -n "${TEST_DATABASE_URL:-}" ]]; then
  exec cargo test "$@"
fi

find_pg_bin() {
  local candidate on_path
  on_path="$(command -v pg_ctl 2>/dev/null || true)"
  for candidate in \
    "${on_path:+$(dirname "$on_path")}" \
    /Applications/Postgres.app/Contents/Versions/latest/bin \
    /opt/homebrew/opt/postgresql@17/bin \
    /opt/homebrew/opt/postgresql@16/bin \
    /usr/lib/postgresql/17/bin \
    /usr/lib/postgresql/16/bin; do
    if [[ -n "$candidate" && -x "$candidate/initdb" && -x "$candidate/pg_ctl" ]]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if ! pg_bin="$(find_pg_bin)"; then
  echo "scripts/test.sh: no Postgres binaries found (initdb, pg_ctl)." >&2
  echo "Install Postgres, or set TEST_DATABASE_URL to a server the tests may create databases on." >&2
  exit 1
fi

data_dir="$(mktemp -d "${TMPDIR:-/tmp}/trakwyn-api-rust-pg.XXXXXX")"
# A socket path has a short length limit, so the socket gets its own short directory.
socket_dir="$(mktemp -d /tmp/trakwyn-pg.XXXXXX)"

cleanup() {
  "$pg_bin/pg_ctl" -D "$data_dir" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$data_dir" "$socket_dir"
}
trap cleanup EXIT

"$pg_bin/initdb" -D "$data_dir" -U postgres -A trust -E UTF8 --no-sync >/dev/null

# Port 0 is not supported, so ask the OS for a free one.
port="$(python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])')"

"$pg_bin/pg_ctl" -D "$data_dir" -w -l "$data_dir/server.log" \
  -o "-p $port -c listen_addresses=127.0.0.1 -c unix_socket_directories=$socket_dir -c fsync=off -c max_connections=200" \
  start >/dev/null

TEST_DATABASE_URL="postgres://postgres@127.0.0.1:$port/postgres" cargo test "$@"
