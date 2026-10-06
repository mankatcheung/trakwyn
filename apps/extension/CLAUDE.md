# apps/extension — subsystem notes

Loaded when working under `apps/extension`, the Trakwyn Clipper. Paths below are relative to `apps/extension/`.

## Build (WXT, JEF-386)

One source, one MV3 manifest per browser, from `wxt.config.ts`. Entrypoints are in `src/entrypoints/` (`popup/`, `options/`, `background.ts`, `content.ts`); shared code is in `src/lib/`. Content-script `matches` live in `content.ts`'s `defineContentScript`, not the config.

```bash
pnpm dev             # build + watch Chrome into .output/chrome-mv3-dev (no browser launch)
pnpm build           # Chrome  -> .output/chrome-mv3
pnpm build:safari    # Safari  -> .output/safari-mv3
pnpm package:safari  # build:safari, then (re)generate the Xcode project in safari/
```

- Load Chrome from `.output/chrome-mv3` (chrome://extensions → Load unpacked).
- **Safari:** open `safari/Trakwyn Clipper/Trakwyn Clipper.xcodeproj`, run the "Trakwyn Clipper" scheme, then in Safari enable Develop → Allow Unsigned Extensions and turn the Clipper on in Settings → Extensions. The project references `.output/safari-mv3` in place, so after the first `package:safari` a `build:safari` plus an Xcode rebuild picks up changes. Re-run `package:safari` only to regenerate the project (e.g. a new permission). The bundle ID `com.trakwyn.clipper` is a placeholder until the App Store release.
- **Version (JEF-389):** `package.json` holds it and release-please bumps it; `wxt.config.ts` sets none, so WXT writes that number into both manifests. Releasing is merging the Clipper's release PR (root `CLAUDE.md`), then building and uploading by hand. The Xcode project's `MARKETING_VERSION` is a committed copy that `package:safari` rewrites from `package.json`. A release PR does not touch it, so run `package:safari` after merging one and before a Safari build.
- Use `browser` from `wxt/browser`, never `chrome.*`. Message listeners return a promise rather than calling `sendResponse` and returning `true`, which Safari does not honour reliably.

## Auth

Both tokens come from the API's `*Mobile` mutations and live in `browser.storage.session` (`lib/storage.ts`). The background worker owns refresh, since the API rotates refresh tokens (`RUNTIME_MESSAGES`).

**Google/GitHub sign-in** runs in the background (the popup closes when the sign-in opens) and is chosen by feature detection in `lib/api.ts`:

- **Chrome** (`identity` present, JEF-383): `launchWebAuthFlow` to `…/start?platform=extension&extensionId=…`, handed back on `https://<id>.chromiumapp.org/`. The ID must be in the API's `EXTENSION_OAUTH_IDS`.
- **Safari** (no `identity` API, JEF-386): `lib/tabOAuth.ts` opens `…/start?platform=extension-tab` in a tab and watches it until it lands on the API's `/auth/oauth/extension/done`, then closes it. Safari may unload the background mid-login, so the login (tab ID and PKCE verifier) is also in `storage.session`, and `registerTabOAuthListeners` is registered when the background starts so a restarted one can still finish it. This is why the Safari manifest has `tabs`.

Either way, the handoff code is redeemed with `exchangeMobileOAuthCode` and this login's PKCE verifier.

## Error reporting (JEF-387)

The Clipper reports faults to the same PostHog project as web and mobile, through `lib/observability/`. These points are load-bearing:

- **Off by default.** Without `VITE_POSTHOG_KEY` at build time (`.env.example`) no request is made, which is the intended state in dev and CI. The key is the public `phc_` one, inlined into the bundle like web's.
- **No SDK.** `report.ts` posts to PostHog's capture endpoint with `fetch`, as web's Vercel function does. `posthog-js` needs a `window` and `localStorage`, which the background service worker has neither of. PostHog answers the CORS preflight for extension origins, so the manifest has no PostHog host permission; adding one would prompt every user on update.
- **No person, no consent gate.** Reports are operational data, not analytics: `$process_person_profile: false`, a random `distinct_id` per event, `$geoip_disable`, and nothing stored between reports. Only faults are sent. A product event (a clip saved, a sign-in) would need a consent decision first. The reasoning is in `infra/posthog/README.md` ("Browser extension errors").
- **Three contexts report: `background`, `popup`, `options`.** Each entrypoint calls `initObservability` first, which adds the `error` and `unhandledrejection` listeners; the popup and options page also sit in `ErrorBoundary`. The content script never reports and has no listeners: on LinkedIn's page they would catch LinkedIn's errors.
- **What is sent.** `$exception` for bugs; `graphql_request_failed` for an unreachable API or a 5xx (never a 4xx or a domain code, the same rule as web and mobile); `token_refresh_failed` and `oauth_login_failed` with a `reason`; `parser_result` when a job's page on a known board gave the parsers less than a clip needs (on LinkedIn and Indeed, only when the URL names a job, so a search page is not a fault). `ApiError` is the API answering, so it is shown to the user and not reported. An error `gql` reported is marked (`markReported`), so no caller reports it again.
- **What is never sent.** Tokens, the email, the OAuth handoff code, the PKCE verifier, GraphQL variables, job content, or a page URL. `parser_result` names the board (`JOB_BOARDS` in `constants.ts`), not the hostname, because a Workday or Greenhouse hostname carries the employer's name. Everything passes `scrub.ts`, a copy of web's that `scrubParity.test.ts` holds identical.
- **`traceparent` goes to the API only**, on every `gql` request. The same id is the `trace_id` on that request's failure event and on the next exception, which links a PostHog report to its Axiom trace.
- **A report never throws or retries.** A failed send is dropped.

## Testing

Vitest with `WxtVitest()`, which points `wxt/browser` at WXT's in-memory `fakeBrowser`. Call `fakeBrowser.reset()` in `beforeEach`. It does not restore properties a test deletes: `apiAuth.test.ts` removes `identity` to simulate Safari and puts it back itself.
