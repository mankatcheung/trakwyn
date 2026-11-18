#!/usr/bin/env bash
# Fails when web's GraphQL documents or src/graphql/generated/ no longer match
# the API schema (JEF-651). Needs no running API, database or port: the schema
# comes from the API's `schema:print`. Run it with `pnpm codegen:check`.
set -euo pipefail

cd "$(dirname "$0")/.."

# Codegen takes the file as SDL only when it ends in .graphql.
schema_dir="$(mktemp -d "${TMPDIR:-/tmp}/trakwyn-schema.XXXXXX")"
trap 'rm -rf "$schema_dir"' EXIT
schema_file="$schema_dir/schema.graphql"

pnpm --silent --filter @trakwyn/api schema:print >"$schema_file"

CODEGEN_SCHEMA="$schema_file" pnpm exec graphql-codegen --config codegen.ts
pnpm exec prettier --write src/graphql/generated >/dev/null

if ! git diff --exit-code --stat -- src/graphql/generated; then
  echo >&2
  echo "src/graphql/generated/ is out of date with the API schema." >&2
  echo "Run pnpm codegen (API running), then pnpm exec prettier --write src/graphql/generated, and commit the result." >&2
  exit 1
fi
echo "Generated GraphQL types match the API schema."
