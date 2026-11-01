#!/usr/bin/env bash
# Lists the Playwright tests that failed and then passed on a retry, as Markdown
# for the job summary (JEF-489). With retries on, a flaky test still turns the
# run green, so without this it costs time and is never fixed.
#
#   flaky-summary.sh <results.json> [label] >> "$GITHUB_STEP_SUMMARY"
#
# <results.json> is Playwright's JSON reporter output. Always exits 0: it
# reports, it does not gate (a flake must not block a deploy).
set -euo pipefail

results="${1:?usage: flaky-summary.sh <results.json> [label]}"
label="${2:-}"
title="Flaky e2e tests${label:+ ($label)}"

if [ ! -s "$results" ]; then
  printf '### %s\n\nNo results file at `%s`, so flaky tests could not be checked.\n' "$title" "$results"
  exit 0
fi

# A test is flaky when its final status is "flaky": failed at first, passed on a
# retry. Describe blocks nest as suites, so the title is the whole path.
rows="$(
  jq -r '
    def flaky($path):
      ( .specs[]? as $spec
        | $spec.tests[]?
        | select(.status == "flaky")
        | [ "`\($spec.file):\($spec.line)`",
            ((($path + [$spec.title]) | join(" › ")) | gsub("\\|"; "\\|")),
            (.results | length | tostring) ]
        | "| " + join(" | ") + " |" ),
      ( .suites[]? | flaky($path + [.title]) );
    [.suites[]? | flaky([])] | .[]
  ' "$results"
)"

if [ -z "$rows" ]; then
  printf '### %s\n\nNone. Every test passed on its first attempt.\n' "$title"
  exit 0
fi

count="$(printf '%s\n' "$rows" | wc -l | tr -d ' ')"
printf '### %s\n\n' "$title"
printf 'Passed only on a retry (%s). Each one is a flake to fix: it costs a rerun and hides a real fault.\n\n' "$count"
printf '| Spec | Test | Attempts |\n| --- | --- | --- |\n'
printf '%s\n' "$rows"
