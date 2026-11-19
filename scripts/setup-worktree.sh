#!/usr/bin/env bash
# Makes a freshly created git worktree runnable: copies apps/api/.env and
# apps/web/.env from the main checkout (rewriting any absolute paths that
# point at the main checkout so they point at this worktree instead),
# copies the committed .env.test.example and .env.e2e.example templates to their
# gitignored .env.test and .env.e2e (with this worktree's ports),
# links the gitignored infra/*/terraform.tfvars and infra/*/.envrc files from
# the main checkout, installs dependencies, applies migrations, and seeds the
# local database.
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

# Dev-server ports (one pair per worktree). The main checkout and CI use web
# 3000 / API 3001, so two agents in two worktrees could not both run the dev
# servers, e2e tests or screenshots. Give this worktree its own pair instead:
# stable (derived from the worktree name, so a re-run keeps it), and moved past
# any pair a sibling worktree already uses. apps/api/.env carries the API's port
# and the origins CORS and OAuth redirects are checked against; apps/web/.env
# carries both ports for the vite proxy and Playwright (apps/web/devPorts.ts).
set_env() { # set_env KEY VALUE FILE: replace the line, or append it
  local key="$1" value="$2" file="$3" tmp
  [ -f "$file" ] || return 0
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" -F= '
    $1 == k { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$file" > "$tmp" && cat "$tmp" > "$file"
  rm -f "$tmp"
}
env_value() { # env_value KEY FILE
  [ -f "$2" ] && sed -n "s/^$1=//p" "$2" | head -1 || true
}

PORT_MIN=3100
PORT_SLOTS=400 # pairs: web = PORT_MIN + 2n, API = web + 1
used_web_ports=" "
for sibling in "$MAIN_ROOT"/.claude/worktrees/*/; do
  [ -d "$sibling" ] || continue
  [ "$(cd "$sibling" && pwd -P)" = "$(pwd -P)" ] && continue
  used_web_ports="$used_web_ports$(env_value WEB_PORT "$sibling/apps/web/.env") "
done

WEB_PORT_VALUE="$(env_value WEB_PORT apps/web/.env)"
if [ -z "$WEB_PORT_VALUE" ]; then
  slot=$(( $(basename "$WORKTREE_ROOT" | cksum | cut -d' ' -f1) % PORT_SLOTS ))
  for _ in $(seq 1 "$PORT_SLOTS"); do
    candidate=$(( PORT_MIN + slot * 2 ))
    case "$used_web_ports" in
      *" $candidate "*) slot=$(( (slot + 1) % PORT_SLOTS )) ;;
      *) break ;;
    esac
  done
  WEB_PORT_VALUE="$candidate"
fi
API_PORT_VALUE=$(( WEB_PORT_VALUE + 1 ))

set_env WEB_PORT "$WEB_PORT_VALUE" apps/web/.env
set_env API_PORT "$API_PORT_VALUE" apps/web/.env
set_env PORT "$API_PORT_VALUE" apps/api/.env
set_env CORS_ORIGIN "http://localhost:$WEB_PORT_VALUE" apps/api/.env
set_env WEB_APP_ORIGIN "http://localhost:$WEB_PORT_VALUE" apps/api/.env
set_env API_ORIGIN "http://localhost:$API_PORT_VALUE" apps/api/.env
echo "dev ports: web $WEB_PORT_VALUE, API $API_PORT_VALUE"

# Local copies of the committed env templates for tests and e2e (JEF-656), the
# same files CI copies, so a run here starts with CI's values and not the dev
# ones in .env. Made only when absent, so a hand edit survives a re-run. The
# e2e API file carries the same port and origins as .env, or two worktrees'
# e2e runs would both want 3001.
copy_template() { # copy_template SRC DEST: copy the committed template once
  [ -f "$1" ] || return 0
  if [ -f "$2" ]; then
    echo "skip: $2 already exists"
    return 0
  fi
  cp "$1" "$2"
  echo "wrote $2"
}
copy_template apps/api/.env.test.example apps/api/.env.test
copy_template apps/api/.env.e2e.example apps/api/.env.e2e
copy_template apps/web/.env.e2e.example apps/web/.env.e2e
set_env PORT "$API_PORT_VALUE" apps/api/.env.e2e
set_env CORS_ORIGIN "http://localhost:$WEB_PORT_VALUE" apps/api/.env.e2e
set_env WEB_APP_ORIGIN "http://localhost:$WEB_PORT_VALUE" apps/api/.env.e2e
set_env API_ORIGIN "http://localhost:$API_PORT_VALUE" apps/api/.env.e2e

# Per-install Terraform config (terraform.tfvars, and the .envrc that holds
# each provider token) is gitignored, so a new worktree has none of it. Link it
# from the main checkout instead of copying: the main checkout stays the one
# place to edit a variable or rotate a token, and no worktree is left holding a
# stale copy. Terraform state is remote, so every checkout sees the same
# infrastructure. `.terraform/` is not shared, so run `terraform init` in each
# root you use (set TF_PLUGIN_CACHE_DIR to avoid re-downloading providers).
echo
for SRC in "$MAIN_ROOT"/infra/*/terraform.tfvars "$MAIN_ROOT"/infra/*/.envrc; do
  [ -f "$SRC" ] || continue
  REL="${SRC#"$MAIN_ROOT"/}"
  DEST="$WORKTREE_ROOT/$REL"

  if [ -e "$DEST" ] || [ -L "$DEST" ]; then
    echo "skip: $REL already exists"
    continue
  fi
  if [ ! -d "$(dirname "$DEST")" ]; then
    # The root does not exist on this branch (added or removed since).
    echo "skip: $REL — $(dirname "$REL") is not on this branch"
    continue
  fi

  ln -s "$SRC" "$DEST"
  echo "linked $REL"
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
echo "Dev servers: web http://localhost:$WEB_PORT_VALUE, API http://localhost:$API_PORT_VALUE (this worktree's own ports)."
echo "Worktree ready. Demo login: demo@trakwyn.app (see apps/api/src/seed.ts for the password)."
