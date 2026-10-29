#!/usr/bin/env bash
# Checks that a freshly deployed service answers (JEF-476). ci.yml runs it
# against a Cloud Run revision that has no traffic yet, and against the
# production site after a Vercel deploy; a failure stops the promotion or
# triggers the rollback.
#
#   smoke-test.sh api <base-url>   GET /ready (database reachable), POST /graphql { __typename }
#   smoke-test.sh web <base-url>   GET / answers an HTML page
#
# Each check is retried, since a revision that scaled from zero needs a moment
# to boot. SMOKE_ATTEMPTS (default 10) and SMOKE_DELAY seconds (default 3) tune it.
set -euo pipefail

mode="${1:-}"
base="${2:-}"
base="${base%/}"
attempts="${SMOKE_ATTEMPTS:-10}"
delay="${SMOKE_DELAY:-3}"

usage() {
  echo "usage: smoke-test.sh <api|web> <base-url>" >&2
  exit 2
}

[[ -n "$base" ]] || usage

# check <description> <text the body must contain> <curl arguments...>
check() {
  local what="$1" want="$2" body="" n
  shift 2
  for ((n = 1; n <= attempts; n++)); do
    if body="$(curl --silent --show-error --fail --location --max-time 20 "$@" 2>&1)" &&
      [[ "$body" == *"$want"* ]]; then
      echo "ok: $what"
      return 0
    fi
    echo "attempt $n/$attempts: $what is not ready: ${body:0:200}" >&2
    if ((n < attempts)); then sleep "$delay"; fi
  done
  echo "::error::Smoke test failed: $what"
  return 1
}

case "$mode" in
  api)
    check "GET /ready" '"status":"ok"' "$base/ready"
    check "POST /graphql { __typename } (GraphQL)" '"__typename"' \
      --request POST --header 'content-type: application/json' \
      --data '{"query":"{ __typename }"}' "$base/graphql"
    ;;
  web)
    check "GET / (an HTML page)" '<html' "$base/"
    ;;
  *) usage ;;
esac
