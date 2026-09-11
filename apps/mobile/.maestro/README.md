# Mobile e2e flows

Seven Maestro flows covering the app's spine (JEF-300, F-1…F-7). They drive a
real release build on an Android emulator or an iOS simulator against a real
API — the tier no Jest project can reach, because nothing below it starts a
process, installs a bundle, or touches a keychain.

## Running them locally

```bash
# once: https://maestro.mobile.dev/getting-started/installing-maestro
curl -Ls https://get.maestro.mobile.dev | bash

# 1. an API on :3001 with the fake providers the flows expect
cd apps/api && OAUTH_PROVIDER_MODE=fake LLM_PROVIDER_MODE=fake EMAIL_PROVIDER=console pnpm dev

# 2. a build on a running emulator/simulator. The API URL is inlined into the
#    bundle at build time (src/constants.ts), so it is set here and not later.
cd apps/mobile
EXPO_PUBLIC_API_URL=http://10.0.2.2:3001/graphql npx expo run:android --variant release

# 3. the flows
pnpm --filter @trakwyn/mobile test:e2e
maestro test .maestro/02-register-and-create-application.yml   # or just one
```

`10.0.2.2` is the Android emulator's route to the host. An iOS simulator shares
the host's network, so it uses `http://localhost:3001/graphql` instead — the two
platforms therefore need two different builds, not one build and two settings.

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
  and asserts only on what it created. The flows share one API and one SQLite
  file, so anything that depends on seeded state — or on another flow — fails
  the moment two of them run together (R-3).
- **Flows run serially.** `maestro test` does that by default; keep it that way
  for the same reason `apps/web/playwright.config.ts` pins `workers: 1`.

## How CI builds the app

`.github/workflows/ci.yml`'s `mobile-e2e-android` job runs `expo prebuild`
followed by Gradle rather than `eas build --local`. Both produce the same APK
from the same continuous-native-generation setup, but prebuild needs no Expo
account and no token — which is what keeps this tier working on pull requests
from forks, where GitHub withholds every secret (R-7).

`eas.json` still carries the `e2e` build profile. It is the switch to Option B
in the plan (EAS Workflows' `type: maestro`) if maintaining the Gradle steps
here turns out to cost more than the build fees: with an Expo account attached,
`eas build --profile e2e --local` builds the same binary these flows expect.
