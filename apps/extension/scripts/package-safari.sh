#!/usr/bin/env bash
# Builds the Clipper for Safari and (re)generates the Xcode project that wraps
# it in a macOS app (JEF-386). Needs macOS with Xcode.
#
# The project references .output/safari-mv3 in place rather than copying it,
# so after the first run `pnpm build:safari` is enough: rebuild in Xcode and
# it picks up the new bundle. Re-run this script only to regenerate the
# project itself, e.g. after the manifest gains a permission.
#
# Usage: pnpm --filter @trakwyn/extension package:safari
set -euo pipefail

cd "$(dirname "$0")/.."

readonly BUNDLE_DIR=".output/safari-mv3"
readonly PROJECT_DIR="safari"
# Placeholder until the Apple team and App Store listing exist (the release
# ticket, like JEF-385 for Chrome). Changing it means regenerating the project.
readonly BUNDLE_ID="${SAFARI_BUNDLE_ID:-com.trakwyn.clipper}"

if ! xcrun --find safari-web-extension-packager >/dev/null 2>&1; then
  echo "safari-web-extension-packager not found: install Xcode (macOS only)." >&2
  exit 1
fi

pnpm exec wxt build -b safari

xcrun safari-web-extension-packager "$BUNDLE_DIR" \
  --project-location "$PROJECT_DIR" \
  --app-name "Trakwyn Clipper" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  --macos-only \
  --no-open \
  --no-prompt \
  --force

# The packager names the extension "$BUNDLE_ID.Extension" but derives the
# app's ID from its name, which Xcode then rejects: an embedded extension's ID
# must start with its app's. Give the app $BUNDLE_ID itself.
readonly PBXPROJ="$PROJECT_DIR/Trakwyn Clipper/Trakwyn Clipper.xcodeproj/project.pbxproj"
sed -i '' -E \
  "s/PRODUCT_BUNDLE_IDENTIFIER = \"[^\"]*Trakwyn-Clipper\";/PRODUCT_BUNDLE_IDENTIFIER = $BUNDLE_ID;/" \
  "$PBXPROJ"

echo "Xcode project: apps/extension/$PROJECT_DIR/Trakwyn Clipper/Trakwyn Clipper.xcodeproj"
