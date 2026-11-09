#!/bin/sh
# Runs the guide scripts (JEF-532): `run.sh capture` or `run.sh verify`.
# Seeds the demo account first, pinned to GUIDES_NOW so dates in the app do not
# drift with the calendar, then runs Playwright with the same instant frozen.
set -eu
mode="${1:?usage: run.sh capture|verify}"
case "$mode" in capture | verify) ;; *) echo "mode must be capture or verify" >&2; exit 2 ;; esac

export GUIDES_MODE="$mode"
export GUIDES_NOW="2026-11-08T12:00:00.000Z"

cd "$(dirname "$0")/../.."
SEED_NOW="$GUIDES_NOW" pnpm --filter @trakwyn/api db:seed
exec playwright test --config playwright.guides.config.ts
