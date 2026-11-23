# Mobile e2e flows

Seventeen Maestro flows: the app's spine (JEF-300, F-1…F-7) and the write paths around it (JEF-668, F-8…F-17). They drive a
real release build on an Android emulator or an iOS simulator against a real
API — the tier no Jest project can reach, because nothing below it starts a
process, installs a bundle, or touches a keychain.

## Running them locally

Run them before you push: the nightly jobs take 40 to 75 minutes and tell you
the next morning (JEF-660).

```bash
# once: https://maestro.mobile.dev/getting-started/installing-maestro
curl -Ls https://get.maestro.mobile.dev | bash

pnpm e2e:local                 # every flow on an iOS simulator
pnpm e2e:local android         # on an Android emulator
pnpm e2e:local ios 04 06       # only the flows numbered 04 and 06
pnpm e2e:local ios --skip-build   # reuse the app already on the device
pnpm e2e:local --help
```

`scripts/mobile-e2e-local.sh` starts the API with the fake providers and a
throwaway database, picks an iOS 26 simulator (CI runs macos-26), builds the
Release app against that API, installs it, runs Maestro and stops everything it
started. The first build takes 10 to 20 minutes on iOS and longer on Android;
later ones are incremental. It prints where the logs, screenshots and view
hierarchies of a failed flow are.

It exists because each of these cost an afternoon the first time:

- **Maestro needs a JDK 17 or newer.** The system `java` may be 1.8; Android
  Studio's bundled JDK works and is found automatically.
- **The simulator version matters.** On iOS 18 flow 04 fails at the back button;
  CI runs iOS 26.
- **Flow 06 types `http://localhost:3001/...`, and the API itself fetches it.**
  When the API runs on another port (every worktree has its own), the script
  forwards 3001 to it.
- **iOS Password AutoFill swallows what Maestro types** into a sign-up form, so
  the script turns it off in the simulator, as the CI job does.
- **A fresh Play Store emulator image starves itself** until Google Play services
  are disabled, and "System UI isn't responding" then covers the app, so every
  flow fails at its first assertion. The script disables them, waits for the
  guest to go idle, and taps Wait if the dialog is still up.
- **`expo run:ios` and `expo prebuild` rewrite two scripts in
  `apps/mobile/package.json`.** The script restores the file.
- **`pnpm stop:worktree` does not stop apps inside simulators.**

To do it by hand instead, this is what the script does. The API needs the fake
providers the flows expect and a port the app was built for; the API URL is
inlined into the bundle at build time (`src/constants.ts`), so it is set at
build time and not later:

```bash
cd apps/api && OAUTH_PROVIDER_MODE=fake LLM_PROVIDER_MODE=fake EMAIL_PROVIDER=console pnpm dev
cd apps/mobile
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/graphql npx expo run:android --variant release
maestro test .maestro/02-register-and-create-application.yml   # or `pnpm test:e2e` for all
```

`10.0.2.2` is the Android emulator's route to the host. An iOS simulator shares
the host's network, so it uses `http://localhost:3001/graphql` instead — the two
platforms therefore need two different builds, not one build and two settings.

That URL is plain HTTP, which a release build on Android refuses by default —
Expo's prebuild only allows cleartext in the debug variants. The local config
plugin `plugins/withCleartextForHttpApi.js` adds the allowance to the release
manifest whenever `EXPO_PUBLIC_API_URL` starts with `http://`, and leaves an
`https://` production build alone. Forget the env var and the release build
both talks to the wrong URL and cannot use cleartext to reach it, which the
first two device runs showed as every flow timing out on the register form
while the API log recorded no request at all.

## Conventions

- **Select by `testID`, never by visible text**, except where the text _is_ the
  assertion (a company name that had to round-trip through the API). The app is
  being redesigned against the Paper mockups; a flow that matches on a label
  breaks on every copy change, and the fix for a broken flow is to fix the flow,
  not to skip it (JEF-300, R-5).
- **A `testID` has to sit on a real view.** A `<Text>` nested inside another
  `<Text>` is a span in its parent's TextView on Android — no view of its own,
  no resource-id — so Maestro cannot find it, however the id is spelled. Put the
  link in a row of sibling `Text`s or in a `Pressable` instead (the first device
  run failed all seven flows on exactly this, at `login-register-link`).
  `src/__tests__/architecture/maestroTestIds.test.ts` checks that every id a
  flow references exists in the app at all; it cannot see nesting.
- **Every flow registers its own account** via `subflows/register-new-account.yml`
  and asserts only on what it created. The flows share one API and one PGlite
  database, so anything that depends on seeded state — or on another flow — fails
  the moment two of them run together (R-3).
- **Creating an application is a subflow.** `subflows/create-application.yml`
  takes `COMPANY` and `ROLE` as `env:` and ends on the Applications tab. Call it
  rather than copying the form steps.
- **Leaving an application's detail screen lands on the dashboard.** The detail
  route resolves to `(home)`'s copy, so `back` (or the pop after a delete) shows
  the dashboard, not the list. Tap `tab-applications` before asserting on the
  list; flows 10 and 11 failed on exactly this.
- **Flows run serially.** `maestro test` does that by default; keep it that way
  for the same reason `apps/web/playwright.config.ts` pins `workers: 1`.

## How CI builds the app

`.github/workflows/mobile-e2e-android.yml` (nightly, on demand, or with the `run-android-e2e` PR label) runs `expo prebuild`
followed by Gradle rather than `eas build --local`. Both produce the same APK
from the same continuous-native-generation setup, but prebuild needs no Expo
account and no token — which is what keeps this tier working on pull requests
from forks, where GitHub withholds every secret (R-7).

`eas.json` still carries the `e2e` build profile. It is the switch to Option B
in the plan (EAS Workflows' `type: maestro`) if maintaining the Gradle steps
here turns out to cost more than the build fees: with an Expo account attached,
`eas build --profile e2e --local` builds the same binary these flows expect.

## Reading an iOS run (JEF-662)

The iOS flows sometimes fail at the register step with "Could not reach the
server": the sign-up request takes longer than the app's 20 s timeout on the
shared macOS runner, and the cause is not known yet. Every run, green or red,
leaves what is needed to compare runs:

- **The job page summary** shows the runner (image, CPU, memory, Xcode), ten
  sign-ups timed right after the warm-up, and the API's slowest requests.
- **The `maestro-ios` artifact** also holds `runner-load.log` (load, memory, the
  database RAM disk and the busiest processes every ten seconds while the flows
  ran), `signup-timing.txt`, `runner-details.txt`, `api.log` and Maestro's
  screenshots and view hierarchies.

A request that the app abandoned has no "request completed" line in `api.log`;
line its "incoming request" time up against the failing flow's time in Maestro's
log instead.
