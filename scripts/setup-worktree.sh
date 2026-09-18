#!/usr/bin/env bash
# Makes a freshly created git worktree runnable: copies apps/api/.env and
# apps/web/.env from the main checkout (rewriting any absolute paths that
# point at the main checkout so they point at this worktree instead),
# installs dependencies, applies migrations, and seeds the local database.
#
# Run from inside the new worktree, after `git worktree add`:
#   pnpm setup:worktree

set -euo pipefail

WORKTREE_ROOT="$(git rev-parse --show-toplevel)"
COMMON_DIR="$(git rev-parse --git-common-dir)"

if [ "$COMMON_DIR" = ".git" ]; then
  echo "error: this is the main checkout, not a linked worktree — nothing to set up." >&2
  exit 1
fi

MAIN_ROOT="$(dirname "$COMMON_DIR")"
cd "$WORKTREE_ROOT"

echo "Main checkout:  $MAIN_ROOT"
echo "This worktree:  $WORKTREE_ROOT"
echo

for app in api web; do
  SRC="$MAIN_ROOT/apps/$app/.env"
  DEST="$WORKTREE_ROOT/apps/$app/.env"

  if [ -f "$DEST" ]; then
    echo "skip: apps/$app/.env already exists"
    continue
  fi

  if [ ! -f "$SRC" ]; then
    echo "skip: $SRC not found — set up apps/$app/.env in the main checkout first"
    continue
  fi

  # DATABASE_URL (and anything else) that embeds an absolute path to the main
  # checkout needs to point at this worktree instead, so each worktree gets
  # its own database rather than sharing (and corrupting) one across branches
  # with different pending migrations. A pre-JEF-342 SQLite `file:` URL is
  # swapped for this worktree's own PGlite directory; the relative
  # `pglite:./.pglite` default is already per-worktree.
  sed -e "s#$MAIN_ROOT#$WORKTREE_ROOT#g" \
      -e 's#^DATABASE_URL=file:.*#DATABASE_URL=pglite:./.pglite#' \
      -e '/^DATABASE_AUTH_TOKEN=/d' \
      "$SRC" > "$DEST"
  echo "wrote apps/$app/.env"
done

if [ ! -f "$WORKTREE_ROOT/apps/api/.env" ]; then
  echo "error: apps/api/.env is missing and there was nothing to copy it from — create one manually before continuing." >&2
  exit 1
fi

echo
echo "Installing dependencies..."
pnpm install --prefer-offline

echo
echo "Applying migrations..."
pnpm --filter @trakwyn/api db:migrate

echo
echo "Seeding local database..."
# db:seed (tsx src/seed.ts) doesn't load .env itself — unlike dev/start, it
# also runs in CI where env vars come from the environment, not a file — so
# pass --env-file explicitly here rather than baking it into the script.
(cd apps/api && npx tsx --env-file=.env src/seed.ts)

echo
echo "Worktree ready. Demo login: demo@trakwyn.app (see apps/api/src/seed.ts for the password)."
