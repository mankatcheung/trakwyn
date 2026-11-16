#!/usr/bin/env bash
# Stops the dev servers, watchers and test runners that were started from inside
# a linked git worktree: `tsx watch`, `vite`, `vitest` workers, esbuild, Expo,
# Playwright and its browsers, and the pnpm/turbo wrappers around them.
#
# Agents start these from a shell tool, and when the tool call is cut off or the
# session ends the children are re-parented to launchd (PPID 1) and keep
# running, so nothing else ever stops them. `tsx watch` also outlives a crashed
# child (it waits for the next file change), so a server that failed to bind its
# port stays behind idle. This is the one place that cleans them up. It runs from
# the project's SessionEnd hook (.claude/settings.json) and by hand.
#
#   pnpm stop:worktree                 # this worktree
#   pnpm stop:worktree --dry-run       # list what would be stopped
#   bash scripts/stop-worktree-processes.sh --quiet [path-to-worktree]
#
# It refuses to run in the main checkout, so it can never stop the developer's
# own `pnpm dev`. It never stops its own ancestors (the agent session itself).

set -uo pipefail

DRY_RUN=0
QUIET=0
TARGET=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --quiet) QUIET=1 ;;
    -*) echo "unknown option: $arg" >&2; exit 2 ;;
    *) TARGET="$arg" ;;
  esac
done

say() { [ "$QUIET" = 1 ] || echo "$@"; }

cd "${TARGET:-${CLAUDE_PROJECT_DIR:-.}}" 2>/dev/null || exit 0
ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || exit 0
COMMON_DIR="$(git rev-parse --git-common-dir 2>/dev/null)" || exit 0
GIT_DIR="$(git rev-parse --git-dir 2>/dev/null)" || exit 0

# In the main checkout the two are the same directory.
if [ "$(cd "$COMMON_DIR" && pwd -P)" = "$(cd "$GIT_DIR" && pwd -P)" ]; then
  say "main checkout, not a linked worktree: nothing to stop."
  exit 0
fi
ROOT="$(cd "$ROOT" && pwd -P)"

# What counts as a dev process. Deliberately narrow: an editor's language
# server that happens to have this directory open is not ours to stop.
PATTERN='tsx|vite|vitest|esbuild|expo|metro|turbo|playwright|ms-playwright|chrome-headless|pnpm|drizzle-kit'

# Never stop this process or anything above it (the shell, Claude Code itself).
PROTECTED=" $$ "
pid=$$
while [ -n "$pid" ] && [ "$pid" -gt 1 ] 2>/dev/null; do
  pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  [ -n "$pid" ] && PROTECTED="$PROTECTED$pid "
done

# Candidates: a command line that names the worktree, or a working directory in it.
CANDIDATES="$(
  {
    ps -axo pid=,command= | awk -v root="$ROOT/" 'index($0, root) { print $1 }'
    lsof -a -d cwd -Fpn 2>/dev/null | awk -v root="$ROOT" '
      /^p/ { pid = substr($0, 2) }
      /^n/ { dir = substr($0, 2); if (dir == root || index(dir, root "/") == 1) print pid }'
  } | sort -un
)"

TO_STOP=""
for pid in $CANDIDATES; do
  case "$PROTECTED" in *" $pid "*) continue ;; esac
  cmd="$(ps -o command= -p "$pid" 2>/dev/null)" || continue
  [ -n "$cmd" ] || continue
  echo "$cmd" | grep -Eq "$PATTERN" || continue
  TO_STOP="$TO_STOP $pid"
  say "  $pid  $(echo "$cmd" | cut -c1-140)"
done

if [ -z "${TO_STOP// /}" ]; then
  say "no leftover processes in $ROOT"
  exit 0
fi

if [ "$DRY_RUN" = 1 ]; then
  say "dry run: not stopping them."
  exit 0
fi

# shellcheck disable=SC2086
kill -TERM $TO_STOP 2>/dev/null
sleep 2
for pid in $TO_STOP; do
  kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null
done
say "stopped:$TO_STOP"
exit 0
