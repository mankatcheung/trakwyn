# apps/extension — subsystem notes

Loaded when working under `apps/extension`, the Trakwyn Clipper. Paths below are relative to `apps/extension/`.

## Build (WXT, JEF-386)

One source, one MV3 manifest per browser, from `wxt.config.ts`. Entrypoints are in `src/entrypoints/` (`popup/`, `options/`, `background.ts`, `content.ts`); shared code is in `src/lib/`. Content-script `matches` live in `content.ts`'s `defineContentScript`, not the config.

```bash
pnpm dev             # build + watch Chrome into .output/chrome-mv3-dev (no browser launch); dev server on :3002
pnpm build           # Chrome  -> .output/chrome-mv3
pnpm build:safari    # Safari  -> .output/safari-mv3
pnpm package:safari  # build:safari, then (re)generate the Xcode project in safari/
```

- Load Chrome from `.output/chrome-mv3` (chrome://extensions → Load unpacked).
- **Safari:** open `safari/Trakwyn Clipper/Trakwyn Clipper.xcodeproj`, run the "Trakwyn Clipper" scheme, then in Safari enable Develop → Allow Unsigned Extensions and turn the Clipper on in Settings → Extensions. The project references `.output/safari-mv3` in place, so after the first `package:safari` a `build:safari` plus an Xcode rebuild picks up changes. Re-run `package:safari` only to regenerate the project (e.g. a new permission). The bundle ID `com.trakwyn.clipper` is a placeholder until the App Store release.
- **Version (JEF-389):** `package.json` holds it and release-please bumps it; `wxt.config.ts` sets none, so WXT writes that number into both manifests. Releasing is merging the Clipper's release PR (root `CLAUDE.md`), then building and uploading by hand. The Xcode project's `MARKETING_VERSION` is a committed copy that `package:safari` rewrites from `package.json`. A release PR does not touch it, so run `package:safari` after merging one and before a Safari build.
- **API URL (JEF-412):** `DEFAULT_API_URL` is `API_URLS.PRODUCTION` (`https://api.trakwyn.com/graphql`) in every build and `API_URLS.DEVELOPMENT` (localhost) only under `pnpm dev`; `VITE_API_URL` at build time overrides both (`.env.example`). `apiUrls.ts` is separate from `constants.ts` because `wxt.config.ts` imports it in Node, where `import.meta.env` is undefined. A user-set URL in the options page (`storage.sync`) still wins over the default.
- **Manifest (JEF-412):** `src/manifest.ts` builds it for both browsers (`manifest.test.ts`). **A production build has no `host_permissions`:** only `pnpm dev` adds the local API. This is deliberate, because a host permission added in an update disables the extension until every user re-approves it, so the first store version has to be right.
  - The API needs none: `corsPlugin.ts` lets any `chrome-extension://` or `safari-web-extension://` origin through and sets no header allow-list, and the Clipper sends bearer tokens, not cookies. That holds for a self-hosted API running the same code, so the options page's custom URL needs no permission prompt either. If a proxy ever strips those CORS headers, add `optional_host_permissions` for it; an _optional_ permission can be added in any update without re-prompting.
  - The job boards are covered by the content script's `matches` in `entrypoints/content.ts` (the real list), and the popup reads the tab through `activeTab`. Do not repeat them as `host_permissions`. A new board is a new `matches` entry, and the same re-approval warning applies to it.
- Use `browser` from `wxt/browser`, never `chrome.*`. Message listeners return a promise rather than calling `sendResponse` and returning `true`, which Safari does not honour reliably.

## Auth

Both tokens come from the API's `*Mobile` mutations and live in `browser.storage.session` (`lib/storage.ts`). The background worker owns refresh, since the API rotates refresh tokens (`RUNTIME_MESSAGES`).

**Keep me signed in (JEF-421).** The sign-in screen has an unticked-by-default box. Ticked, `setAuth(auth, true)` also writes the **refresh token only** to `browser.storage.local` (`STORAGE_KEYS.PERSISTED_REFRESH_TOKEN`); the access token and `expiresAt` never leave `storage.session`. The key's presence is the choice, so nothing else records it.

- **Restore:** a browser restart empties `storage.session` but not `storage.local`. `refreshToken()` falls back to the persisted token when there is no session, so the background's startup `scheduleRefresh`, the popup's `init` and `authedGql` all restore through the same single-flighted refresh.
- **Rotation:** every refresh stores the new pair with the same `persist` flag, so the persisted copy is always the current token. The API treats a superseded token as reuse and revokes the session (`RotateRefreshTokenUseCase`), so a stale copy must never be left behind.
- **Clearing:** sign-out (`clearAuth`) and a refresh the API refuses remove both copies. An **unreachable** API (the browser started offline) clears only the session (`clearSessionAuth`) and keeps the persisted token for the next try. A later sign-in without the box removes an older persisted token.
- **Content scripts can read `storage.local`** (only `storage.session` is closed to them by default) and `content.ts` runs inside job-board pages, so `restrictLocalStorageToTrustedContexts` limits it to `TRUSTED_CONTEXTS` before every persisting write. It is applied per browser session, so it is called on each write rather than once. A browser without `setAccessLevel` is left as is. Never widen `storage.session`'s access level either.
- **Safari tab sign-in** keeps the choice in the pending login (`PendingTabOAuth.keepSignedIn`), so a background restarted mid-login still honours it.
- **The token is on disk unencrypted** in the browser profile, so the API's absolute session lifetime (`SESSION.ABSOLUTE_TTL_MS`, JEF-422) is what bounds a copied one. Keep the box opt-in.

**Google/GitHub sign-in** runs in the background (the popup closes when the sign-in opens) and is chosen by feature detection in `lib/api.ts`:

- **Chrome** (`identity` present, JEF-383): `launchWebAuthFlow` to `…/start?platform=extension&extensionId=…`, handed back on `https://<id>.chromiumapp.org/`. The ID must be in the API's `EXTENSION_OAUTH_IDS`. A Web Store build has its own permanent ID (the unpacked ID differs, since Chrome derives it from the folder), so create the draft listing first, take the ID from the dashboard and add it to the production `EXTENSION_OAUTH_IDS` (`infra/gcp`) before the listing goes live, or Chrome sign-in fails for every user.
- **Safari** (no `identity` API, JEF-386): `lib/tabOAuth.ts` opens `…/start?platform=extension-tab` in a tab and watches it until it lands on the API's `/auth/oauth/extension/done`, then closes it. Safari may unload the background mid-login, so the login (tab ID, PKCE verifier and "Keep me signed in" choice) is also in `storage.session`, and `registerTabOAuthListeners` is registered when the background starts so a restarted one can still finish it. This is why the Safari manifest has `tabs`.

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
