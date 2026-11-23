#!/usr/bin/env bash
# Runs the mobile Maestro flows (apps/mobile/.maestro) on a local iOS simulator
# or Android emulator, the way the nightly jobs do, so a failing flow is found
# before the push instead of the next morning (JEF-660).
#
#   pnpm e2e:local                      # every flow on an iOS simulator
#   pnpm e2e:local android              # every flow on an Android emulator
#   pnpm e2e:local ios 04 06            # only the flows numbered 04 and 06
#   pnpm e2e:local ios --skip-build     # reuse the app already on the device
#   pnpm e2e:local --help
#
# What it does, in order: starts the API with the fake providers on a throwaway
# database, picks the same simulator version CI uses (iOS 26), builds the
# Release app against that API, installs it, runs Maestro, and stops everything
# it started. Details and the reasons for each step are in
# apps/mobile/.maestro/README.md.

set -uo pipefail

usage() {
  cat <<'EOF'
Usage: pnpm e2e:local [ios|android] [NN ...] [options]

  ios | android     platform to run on (default: ios)
  NN                run only the flow files that start with NN, e.g. 04 06
                    (default: every flow)

Options:
  --skip-build      reuse the app already installed on the device
  --device ID       iOS simulator UDID or Android adb serial (default: picked)
  --window          show the device on screen: the Android emulator window (default:
                    headless) or Simulator.app for the iOS simulator
  --keep            leave a device this script booted running afterwards
  -h, --help        show this help

Environment:
  E2E_API_PORT      API port (default: PORT from apps/api/.env, else 3001).
                    The app bakes the port in at build time, so --skip-build
                    only works with the port the app was built for.
  E2E_AVD           Android virtual device to boot (default: the first one)
  JAVA_HOME         a JDK 17 or newer (default: found automatically)
EOF
}

die() {
  echo "error: $*" >&2
  exit 2
}

step() {
  echo
  echo "==> $*"
}

warn() {
  echo "warning: $*" >&2
}

PLATFORM="ios"
SKIP_BUILD=0
KEEP_DEVICE=0
SHOW_WINDOW=0
DEVICE=""
FLOW_PREFIXES=()

while [ $# -gt 0 ]; do
  case "$1" in
    ios | android) PLATFORM="$1" ;;
    --skip-build) SKIP_BUILD=1 ;;
    --keep) KEEP_DEVICE=1 ;;
    --window) SHOW_WINDOW=1 ;;
    --device)
      [ -n "${2:-}" ] || die "--device needs a value"
      DEVICE="$2"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    [0-9][0-9]) FLOW_PREFIXES+=("$1") ;;
    *) die "unknown argument: $1 (try --help)" ;;
  esac
  shift
done

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)" || die "run this from inside the repository"
MOBILE="$ROOT/apps/mobile"
MAESTRO_DIR="$MOBILE/.maestro"
APP_ID="com.trakwyn.app"

# Everything this run writes goes here; the logs stay behind, the database does not.
RUN_DIR="$(mktemp -d "${TMPDIR:-/tmp}/trakwyn-e2e-local.XXXXXX")"

# --- cleanup ---------------------------------------------------------------

# Job control gives every background job its own process group, so one signal
# stops `pnpm dev` and the tsx watcher it spawns, which a plain `kill` of the
# pnpm process would leave running.
set -m

STARTED_GROUPS=()
STARTED_DEVICE=""
PKG_WAS_CLEAN=0

# shellcheck disable=SC2329 # run by the trap below
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  local group
  for group in "${STARTED_GROUPS[@]:-}"; do
    [ -n "$group" ] || continue
    kill -TERM -- "-$group" 2>/dev/null
    # Reaping inside a redirected group keeps bash from printing "Terminated".
    { wait "$group"; } 2>/dev/null
  done
  if [ -n "$STARTED_DEVICE" ] && [ "$KEEP_DEVICE" = 0 ]; then
    if [ "$PLATFORM" = ios ]; then
      xcrun simctl shutdown "$STARTED_DEVICE" 2>/dev/null
    else
      "$ADB" -s "$STARTED_DEVICE" emu kill >/dev/null 2>&1
    fi
  fi
  # expo prebuild and expo run:ios rewrite two scripts in apps/mobile/package.json.
  if [ "$PKG_WAS_CLEAN" = 1 ] && ! git -C "$ROOT" diff --quiet -- apps/mobile/package.json; then
    git -C "$ROOT" checkout -- apps/mobile/package.json
  fi
  rm -rf "$RUN_DIR/pglite"
  echo
  echo "Logs and Maestro output: $RUN_DIR"
  exit "$status"
}
trap cleanup EXIT INT TERM

git -C "$ROOT" diff --quiet -- apps/mobile/package.json && PKG_WAS_CLEAN=1

# --- tools -----------------------------------------------------------------

java_major() {
  "$1/bin/java" -version 2>&1 | head -1 | sed -E 's/.*"([0-9]+)(\.([0-9]+))?.*/\1/;s/^1$/8/'
}

find_java_home() {
  local candidate
  for candidate in \
    "${JAVA_HOME:-}" \
    "$(/usr/libexec/java_home -v 17+ 2>/dev/null)" \
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home" \
    "$HOME/Applications/Android Studio.app/Contents/jbr/Contents/Home"; do
    [ -n "$candidate" ] && [ -x "$candidate/bin/java" ] || continue
    [ "$(java_major "$candidate")" -ge 17 ] 2>/dev/null && {
      echo "$candidate"
      return 0
    }
  done
  return 1
}

find_tools() {
  MAESTRO="$(command -v maestro || true)"
  [ -n "$MAESTRO" ] || MAESTRO="$HOME/.maestro/bin/maestro"
  [ -x "$MAESTRO" ] || die "Maestro is not installed. Install it with: curl -Ls https://get.maestro.mobile.dev | bash"
  JAVA_HOME="$(find_java_home)" || die "Maestro needs a JDK 17 or newer and none was found. Set JAVA_HOME (Android Studio's bundled JDK works)."
  export JAVA_HOME
  command -v pnpm >/dev/null || die "pnpm is not on the PATH"
  command -v node >/dev/null || die "node is not on the PATH"
  echo "Maestro: $("$MAESTRO" --version 2>/dev/null | tail -1)   JDK: $JAVA_HOME"
}

# --- the API ---------------------------------------------------------------

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

api_up() {
  curl -sf -X POST -H 'content-type: application/json' \
    -d '{"query":"{ __typename }"}' "http://127.0.0.1:$API_PORT/graphql" >/dev/null 2>&1
}

pick_api_port() {
  if [ -n "${E2E_API_PORT:-}" ]; then
    API_PORT="$E2E_API_PORT"
    return
  fi
  API_PORT="$(sed -nE 's/^PORT=([0-9]+).*/\1/p' "$ROOT/apps/api/.env" 2>/dev/null | head -1)"
  API_PORT="${API_PORT:-3001}"
}

# The same configuration the nightly jobs write to apps/api/.env, plus the
# plans switch the committed e2e template turns off. DOTENV_CONFIG_PATH points
# at nothing so a worktree's own .env cannot add settings CI does not have.
api_env() {
  API_ENV=(
    "DOTENV_CONFIG_PATH=/nonexistent"
    "PORT=$API_PORT"
    "NODE_ENV=development"
    "DATABASE_URL=pglite:$RUN_DIR/pglite"
    "JWT_SECRET=e2e-only-jwt-secret"
    "JWT_REFRESH_SECRET=e2e-only-refresh-secret"
    "TOTP_ENCRYPTION_KEY=e2e-only-totp-encryption-key"
    "LLM_API_KEY_ENCRYPTION_KEY=e2e-only-llm-encryption-key"
    "STORAGE_PROVIDER=local"
    "CACHE_PROVIDER=memory"
    "EMAIL_PROVIDER=console"
    "CORS_ORIGIN=http://localhost:3000"
    "WEB_APP_ORIGIN=http://localhost:3000"
    "API_ORIGIN=http://localhost:$API_PORT"
    "COOKIE_DOMAIN="
    "GOOGLE_OAUTH_CLIENT_ID=e2e-fake-google-client-id"
    "GITHUB_OAUTH_CLIENT_ID=e2e-fake-github-client-id"
    "OAUTH_PROVIDER_MODE=fake"
    "LLM_PROVIDER_MODE=fake"
    "SEARCH_PROVIDER=fake"
    "PLANS_ENFORCED=false"
  )
}

start_api() {
  pick_api_port
  if port_in_use "$API_PORT"; then
    die "port $API_PORT is already in use (is 'pnpm dev' running?). Stop it, or pick another port with E2E_API_PORT."
  fi
  api_env
  step "Starting the API on port $API_PORT (throwaway database)"
  (cd "$ROOT" && env "${API_ENV[@]}" pnpm --filter @trakwyn/api db:migrate:apply) \
    > "$RUN_DIR/api-migrate.log" 2>&1 || {
    tail -20 "$RUN_DIR/api-migrate.log" >&2
    die "the database migration failed (log: $RUN_DIR/api-migrate.log)"
  }
  (cd "$ROOT/apps/api" && exec env "${API_ENV[@]}" pnpm dev) > "$RUN_DIR/api.log" 2>&1 &
  STARTED_GROUPS+=("$!")
  local api_pid="$!" waited=0
  until api_up; do
    kill -0 "$api_pid" 2>/dev/null || {
      tail -20 "$RUN_DIR/api.log" >&2
      die "the API exited before it answered (log: $RUN_DIR/api.log)"
    }
    waited=$((waited + 2))
    [ "$waited" -lt 120 ] || die "the API did not answer within 120 s (log: $RUN_DIR/api.log)"
    sleep 2
  done
  echo "API is up."
}

# Flow 06 types http://localhost:3001/... into the app, and the API itself is
# what fetches it. When the API is elsewhere, forward 3001 to it.
forward_flow_port() {
  [ "$API_PORT" != 3001 ] || return 0
  if port_in_use 3001; then
    warn "port 3001 is in use, so flow 06 (assistant chat) will not reach this API"
    return 0
  fi
  node -e '
    const net = require("net");
    const target = Number(process.argv[1]);
    net.createServer((client) => {
      const upstream = net.connect(target, "127.0.0.1");
      client.pipe(upstream);
      upstream.pipe(client);
      client.on("error", () => upstream.destroy());
      upstream.on("error", () => client.destroy());
    }).listen(3001, "127.0.0.1");
  ' "$API_PORT" > "$RUN_DIR/forward.log" 2>&1 &
  STARTED_GROUPS+=("$!")
  echo "Forwarding port 3001 to the API for flow 06."
}

# --- iOS -------------------------------------------------------------------

# Prefers a simulator that is already booted, then "iPhone 17", on the newest
# iOS 26 or later runtime: CI runs the flows on macos-26.
pick_ios_device() {
  xcrun simctl list devices available -j | python3 -I -c '
import json, sys
best = None
for runtime, devices in json.load(sys.stdin)["devices"].items():
    if "iOS-" not in runtime:
        continue
    major = int(runtime.split("iOS-")[1].split("-")[0])
    if major < 26:
        continue
    for device in devices:
        if not device["name"].startswith("iPhone"):
            continue
        rank = (device["state"] == "Booted", device["name"] == "iPhone 17", major)
        if best is None or rank > best[0]:
            best = (rank, device["udid"])
print(best[1] if best else "")
'
}

# iOS swaps the keyboard for its "Automatic Strong Password" view on a sign-up
# form, which swallows what Maestro types. Turn Password AutoFill off in the
# simulator's configuration profile, as the CI job does, and reboot it.
disable_password_autofill() {
  local udid="$1" dir plist changed=0 found=0
  dir="$HOME/Library/Developer/CoreSimulator/Devices/$udid/data/Containers/Shared/SystemGroup/systemgroup.com.apple.configurationprofiles/Library/ConfigurationProfiles"
  for plist in UserSettings.plist EffectiveUserSettings.plist PublicInfo/PublicEffectiveUserSettings.plist; do
    [ -f "$dir/$plist" ] || continue
    found=1
    if [ "$(plutil -extract restrictedBool.allowPasswordAutoFill.value raw "$dir/$plist" 2>/dev/null)" != "false" ]; then
      plutil -replace restrictedBool.allowPasswordAutoFill.value -bool NO "$dir/$plist" && changed=1
    fi
  done
  [ "$found" = 1 ] || {
    warn "no configuration profile found for the simulator; Password AutoFill may break the register flow"
    return 0
  }
  [ "$changed" = 1 ] || return 0
  xcrun simctl shutdown "$udid"
  xcrun simctl boot "$udid"
  xcrun simctl bootstatus "$udid" -b >/dev/null
}

prepare_ios_device() {
  command -v xcrun >/dev/null || die "Xcode's command line tools are required for iOS (xcrun not found)"
  if [ -z "$DEVICE" ]; then
    DEVICE="$(pick_ios_device)"
    [ -n "$DEVICE" ] || die "no iOS 26 simulator found. Install the iOS 26 runtime in Xcode (Settings > Components)."
  fi
  step "iOS simulator $DEVICE"
  if ! xcrun simctl list devices | grep "$DEVICE" | grep -q Booted; then
    xcrun simctl boot "$DEVICE" || die "could not boot simulator $DEVICE"
    STARTED_DEVICE="$DEVICE"
  fi
  xcrun simctl bootstatus "$DEVICE" -b >/dev/null
  disable_password_autofill "$DEVICE"
  # After the autofill reboot, so the window shows the final state.
  [ "$SHOW_WINDOW" = 1 ] && show_ios_simulator "$DEVICE"
  return 0
}

# A booted simulator has no window until an app opens it. Xcode up to 26 ships
# Simulator.app; Xcode 27 replaced it with DeviceHub.app, which lists the booted
# simulators itself. Neither is reachable by name with `open -a`.
show_ios_simulator() {
  local dev="$1" xcode app
  xcode="$(dirname "$(xcode-select -p)")"
  for app in "$(xcode-select -p)/Applications/Simulator.app" "$xcode/Applications/DeviceHub.app"; do
    if [ -d "$app" ]; then
      open "$app" --args -CurrentDeviceUDID "$dev" || warn "could not open $app"
      return 0
    fi
  done
  warn "neither Simulator.app nor DeviceHub.app was found in Xcode; open the simulator by hand"
}

build_ios() {
  step "Building the iOS app (Release). The first build takes 10 to 20 minutes; log: $RUN_DIR/ios-build.log"
  (cd "$MOBILE" && EXPO_PUBLIC_API_URL="http://localhost:$API_PORT/graphql" \
    pnpm exec expo run:ios --configuration Release --no-bundler --device "$DEVICE") \
    > "$RUN_DIR/ios-build.log" 2>&1
  # expo run:ios also opens the app afterwards, which can time out on a busy
  # machine after a good build and install. Only a missing app is a failure.
  xcrun simctl get_app_container "$DEVICE" "$APP_ID" >/dev/null 2>&1 || {
    tail -30 "$RUN_DIR/ios-build.log" >&2
    die "the iOS build did not install the app (log: $RUN_DIR/ios-build.log)"
  }
}

# --- Android ---------------------------------------------------------------

android_tools() {
  local sdk="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Library/Android/sdk}}"
  [ -d "$sdk" ] || die "the Android SDK was not found (looked in $sdk). Set ANDROID_HOME."
  export ANDROID_HOME="$sdk"
  ADB="$sdk/platform-tools/adb"
  EMULATOR="$sdk/emulator/emulator"
  [ -x "$ADB" ] || die "adb not found in $sdk/platform-tools"
  [ -x "$EMULATOR" ] || die "the emulator was not found in $sdk/emulator"
}

wait_for_android_boot() {
  local serial="$1" waited=0
  "$ADB" -s "$serial" wait-for-device
  until [ "$("$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    waited=$((waited + 3))
    [ "$waited" -lt 300 ] || die "the emulator did not finish booting within 5 minutes (log: $RUN_DIR/emulator.log)"
    sleep 3
  done
}

# A guest that has just booted keeps itself busy for a minute or two. Flows
# that start then meet "System UI isn't responding", so wait until it is idle.
wait_for_android_idle() {
  local serial="$1" waited=0 idle
  while [ "$waited" -lt 180 ]; do
    idle="$("$ADB" -s "$serial" shell top -b -n 1 2>/dev/null | grep -o '[0-9]*%idle' | head -1 | tr -dc '0-9')"
    [ "${idle:-0}" -ge 80 ] && return 0
    sleep 5
    waited=$((waited + 5))
  done
  warn "the emulator was still busy after 3 minutes; the flows may meet 'System UI isn't responding'"
}

# If that dialog is already up, tap Wait on it (found through uiautomator, so no
# screen coordinates are assumed).
dismiss_android_anr() {
  local serial="$1" bounds x y
  for _ in 1 2 3; do
    "$ADB" -s "$serial" shell uiautomator dump /sdcard/e2e-ui.xml >/dev/null 2>&1 || return 0
    bounds="$("$ADB" -s "$serial" shell cat /sdcard/e2e-ui.xml 2>/dev/null |
      grep -o 'text="Wait"[^>]*bounds="\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]"' | head -1 |
      grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]')"
    [ -n "$bounds" ] || return 0
    read -r x y <<<"$(echo "$bounds" |
      sed -E 's/\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]/\1 \2 \3 \4/' |
      awk '{print int(($1 + $3) / 2), int(($2 + $4) / 2)}')"
    "$ADB" -s "$serial" shell input tap "$x" "$y"
    sleep 3
  done
}

# A fresh Play Store image runs Google Play services updates in the background,
# which starves the guest until "System UI isn't responding" covers the app.
quiet_android_device() {
  local serial="$1" package
  for package in com.google.android.gms com.android.vending com.google.android.gsf \
    com.google.android.googlequicksearchbox; do
    "$ADB" -s "$serial" shell pm list packages 2>/dev/null | grep -q "package:$package\$" &&
      "$ADB" -s "$serial" shell pm disable-user --user 0 "$package" >/dev/null 2>&1
  done
  local scale
  for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
    "$ADB" -s "$serial" shell settings put global "$scale" 0
  done
}

prepare_android_device() {
  android_tools
  if [ -z "$DEVICE" ]; then
    DEVICE="$("$ADB" devices | awk '/^emulator-[0-9]+[[:space:]]+device/ {print $1; exit}')"
  fi
  if [ -z "$DEVICE" ]; then
    local avd="${E2E_AVD:-$("$EMULATOR" -list-avds | head -1)}"
    [ -n "$avd" ] || die "no Android virtual device found. Create one in Android Studio (Device Manager)."
    step "Booting the Android emulator $avd"
    local args=(-avd "$avd" -no-snapshot-save -noaudio -no-boot-anim -camera-back none -gpu swiftshader_indirect)
    [ "$SHOW_WINDOW" = 1 ] || args+=(-no-window)
    "$EMULATOR" "${args[@]}" > "$RUN_DIR/emulator.log" 2>&1 &
    STARTED_GROUPS+=("$!")
    "$ADB" wait-for-device
    DEVICE="$("$ADB" devices | awk '/^emulator-[0-9]+/ {print $1; exit}')"
    STARTED_DEVICE="$DEVICE"
  fi
  step "Android device $DEVICE"
  wait_for_android_boot "$DEVICE"
  quiet_android_device "$DEVICE"
  wait_for_android_idle "$DEVICE"
  dismiss_android_anr "$DEVICE"
}

build_android() {
  step "Building the Android app (Release). The first build takes 20 minutes or more; log: $RUN_DIR/android-build.log"
  (
    cd "$MOBILE" &&
      EXPO_PUBLIC_API_URL="http://10.0.2.2:$API_PORT/graphql" \
        pnpm exec expo prebuild --platform android --no-install &&
      cd android &&
      ./gradlew assembleRelease --build-cache
  ) > "$RUN_DIR/android-build.log" 2>&1 || {
    tail -30 "$RUN_DIR/android-build.log" >&2
    die "the Android build failed (log: $RUN_DIR/android-build.log)"
  }
  "$ADB" -s "$DEVICE" install -r "$MOBILE/android/app/build/outputs/apk/release/app-release.apk" >/dev/null ||
    die "adb could not install the APK"
}

# --- flows -----------------------------------------------------------------

flow_targets() {
  local prefix matches
  if [ "${#FLOW_PREFIXES[@]}" -eq 0 ]; then
    echo "$MAESTRO_DIR"
    return
  fi
  for prefix in "${FLOW_PREFIXES[@]}"; do
    matches="$(ls "$MAESTRO_DIR/$prefix"-*.yml 2>/dev/null)"
    [ -n "$matches" ] || die "no flow starts with $prefix in $MAESTRO_DIR"
    echo "$matches"
  done
}

run_flows() {
  local targets=()
  local line
  while IFS= read -r line; do
    targets+=("$line")
  done < <(flow_targets)

  if [ "$PLATFORM" = ios ]; then
    # The first launch after a simulator reboot is the slowest; pay for it here.
    step "Warming up the simulator"
    "$MAESTRO" --device "$DEVICE" test "$MAESTRO_DIR/warm-up/first-launch.yml" \
      > "$RUN_DIR/warm-up.log" 2>&1 || warn "the warm-up flow failed (log: $RUN_DIR/warm-up.log)"
  fi

  step "Running the flows"
  "$MAESTRO" --device "$DEVICE" test "${targets[@]}" --debug-output "$RUN_DIR/maestro"
}

# --- main ------------------------------------------------------------------

find_tools
start_api
forward_flow_port

if [ "$PLATFORM" = ios ]; then
  prepare_ios_device
  [ "$SKIP_BUILD" = 1 ] || build_ios
else
  prepare_android_device
  [ "$SKIP_BUILD" = 1 ] || build_android
fi

run_flows
STATUS=$?

echo
if [ "$STATUS" = 0 ]; then
  echo "All flows passed."
else
  echo "Some flows failed. Screenshots, view hierarchies and logs for each failed flow are under $RUN_DIR/maestro."
fi
exit "$STATUS"
