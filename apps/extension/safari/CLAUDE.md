# apps/extension/safari - Xcode wrapper notes

Loaded when working under `apps/extension/safari`. The rest of the Clipper notes are in `apps/extension/CLAUDE.md`.

## Running it

Open `safari/Trakwyn Clipper/Trakwyn Clipper.xcodeproj`, run the "Trakwyn Clipper" scheme, then in Safari enable Develop → Allow Unsigned Extensions and turn the Clipper on in Settings → Extensions. The project references `.output/safari-mv3` in place, so after the first `package:safari` a `build:safari` plus an Xcode rebuild picks up changes. Re-run `package:safari` only to regenerate the project (e.g. a new permission). The bundle ID `com.trakwyn.clipper` is a placeholder until the App Store release.
