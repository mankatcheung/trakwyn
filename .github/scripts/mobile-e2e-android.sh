#!/usr/bin/env bash
# Runs the Maestro flows against the emulator that android-emulator-runner
# booted, and leaves behind what a red run needs to be diagnosed (JEF-300).
#
# This is one script rather than the action's multi-line `script:` input on
# purpose: the action runs each line of that input as its own `sh -c`, so no
# variable survives from one line to the next. An earlier version did
# `maestro … || status=$?` on one line and `exit $status` on another, and a
# run with 7/7 flows failed came back green. Everything the job needs to do
# after the flows — while the emulator is still alive — therefore lives here,
# in one process, and the exit status is Maestro's.
set -u

apk=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
out="${RUNNER_TEMP:?RUNNER_TEMP is set on every GitHub-hosted runner}"

adb install -r "$apk"

status=0
maestro test apps/mobile/.maestro --debug-output "$out/maestro-debug" || status=$?

# Maestro's artifacts — per flow: screenshots, the screen hierarchy at the
# failing step, the device logcat and its own log — land in a *hidden*
# .maestro/ tree under --debug-output; the listing is what the upload step's
# file count is checked against.
echo "::group::Maestro output on disk"
ls -laR "$out/maestro-debug" 2>/dev/null || echo "(no --debug-output directory)"
echo "::endgroup::"

exit "$status"
