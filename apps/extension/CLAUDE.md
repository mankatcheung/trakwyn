# apps/extension — subsystem notes

Loaded when working under `apps/extension`, the Trakwyn Clipper. Paths below are relative to `apps/extension/`.

## Build (WXT, JEF-386)

One source, one MV3 manifest per browser, from `wxt.config.ts`. Entrypoints are in `src/entrypoints/` (`popup/`, `background.ts`, `content.ts`); shared code is in `src/lib/`. Content-script `matches` live in `content.ts`'s `defineContentScript`, not the config.

```bash
pnpm dev             # build + watch Chrome into .output/chrome-mv3-dev (no browser launch); dev server on :3002
pnpm build           # Chrome  -> .output/chrome-mv3
pnpm build:safari    # Safari  -> .output/safari-mv3
pnpm package:safari  # build:safari, then (re)generate the Xcode project in safari/
pnpm build:firefox   # Firefox -> .output/firefox-mv3
pnpm zip:firefox     # add-on zip + AMO sources zip in .output/
```

- Load Chrome from `.output/chrome-mv3` (chrome://extensions → Load unpacked).
- **Firefox (JEF-423):** load `.output/firefox-mv3` from `about:debugging` → This Firefox → Load Temporary Add-on (pick its `manifest.json`). See "Firefox" below for how it differs, and `docs/releasing.md` for how it is released.
- **Safari:** the Xcode wrapper and how to run it are in `safari/CLAUDE.md`.
- **Version (JEF-389):** `package.json` holds it and release-please bumps it; `wxt.config.ts` sets none, so WXT writes that number into both manifests. Releasing is merging the Clipper's release PR (root `CLAUDE.md`), then building and uploading by hand: see `docs/releasing.md`. The Xcode project's `MARKETING_VERSION` is a committed copy that `package:safari` rewrites from `package.json`. A release PR does not touch it, so run `package:safari` after merging one and before a Safari build.
- **API URL (JEF-412, JEF-419):** `DEFAULT_API_URL` is `API_URLS.DEVELOPMENT` (localhost) only under `pnpm dev`, and `VITE_API_URL` at build time everywhere else (`.env.example`). The production URL is not in the source: the release workflow reads it from the `CLIPPER_API_URL` repository variable, and a `build` or `zip` without `VITE_API_URL` fails in a `build:before` hook in `wxt.config.ts` (`.env` counts). The check is a hook, not a throw in `resolveDefaultApiUrl`, because `wxt prepare` (postinstall, typecheck) imports that with no variable set and must keep working; the resolver returns an empty URL there. CI writes a placeholder `apps/extension/.env` before `pnpm build`, since nothing in CI calls the API. After `pnpm setup:worktree`, set `VITE_API_URL` in `apps/extension/.env` (the copied `.env.example` leaves it blank) before building. `apiUrls.ts` is separate from `constants.ts` because `wxt.config.ts` imports it in Node, where `import.meta.env` is undefined. **Web URL (JEF-428):** the popup's links to the web app (a saved application, `/settings/ai`) use `DEFAULT_WEB_URL`, which is `WEB_URLS.DEVELOPMENT` under `pnpm dev` and `VITE_WEB_URL` at build time (the release workflow's `CLIPPER_WEB_URL` repository variable, the web origin such as `https://www.trakwyn.com`). It is never derived from the API URL: production serves them from different hosts (`api.trakwyn.com` vs `www.trakwyn.com`), and deriving it sent "Open application" to the API. A `build` without it fails in the same `build:before` hook, and CI's placeholder `.env` sets both. There is no options page and no user-set URL (JEF-418): the first store version has no settings screen, so the extension talks only to the API it was built for.
- **Manifest (JEF-412):** `src/manifest.ts` builds it for both browsers (`manifest.test.ts`). **A production build has no `host_permissions`:** only `pnpm dev` adds the local API. This is deliberate, because a host permission added in an update disables the extension until every user re-approves it, so the first store version has to be right.
  - The API needs none: `corsPlugin.ts` lets any `chrome-extension://`, `safari-web-extension://` or `moz-extension://` origin through and sets no header allow-list, and the Clipper sends bearer tokens, not cookies. If a proxy ever strips those CORS headers, add `optional_host_permissions` for it; an _optional_ permission can be added in any update without re-prompting.
  - The job boards are covered by the content script's `matches` in `entrypoints/content.ts` (the real list), and the popup reads the tab through `activeTab`. Do not repeat them as `host_permissions`. A new board is a new `matches` entry, and the same re-approval warning applies to it.
- Use `browser` from `wxt/browser`, never `chrome.*`. Message listeners return a promise rather than calling `sendResponse` and returning `true`, which Safari does not honour reliably.

## Lint and format (JEF-493)

```bash
pnpm lint            # eslint . (flat config in eslint.config.mjs; also run by the root `pnpm lint`)
pnpm lint:fix
pnpm format:check    # prettier --check ., using the root .prettierrc and .prettierignore
pnpm format
```

The config mirrors `apps/web`'s (typescript-eslint recommended, React, react-hooks, `eslint-config-prettier`) without the Tailwind and i18n plugins. It ignores `.output/`, `.wxt/`, `dist/` and `safari/`, which are generated (the root `.prettierignore` skips the same). An `eslint-disable` needs a reason beside it.

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
  - **The Web Store ID is `pnpgngnojencbggokjhpfhmliijakmhe`** (JEF-415), owned by an individual developer account's publisher, not a group publisher. It is permanent for the listing. It goes in production `EXTENSION_OAUTH_IDS`; the dashboard URL is `…/devconsole/<publisher>/pnpgngnojencbggokjhpfhmliijakmhe/edit`.
- **Safari** (no `identity` API, JEF-386): `lib/tabOAuth.ts` opens `…/start?platform=extension-tab` in a tab and watches it until it lands on the API's `/auth/oauth/extension/done`, then closes it. Safari may unload the background mid-login, so the login (tab ID, PKCE verifier and "Keep me signed in" choice) is also in `storage.session`, and `registerTabOAuthListeners` is registered when the background starts so a restarted one can still finish it. This is why the Safari manifest has `tabs`.

Either way, the handoff code is redeemed with `exchangeMobileOAuthCode` and this login's PKCE verifier.

## Error reporting (JEF-387)

The Clipper reports faults to PostHog with no SDK and no consent gate; what is sent and what never is, lives in `src/lib/observability/CLAUDE.md`. Read it before adding a report or a field to one.

## The popup

Reading a posting (parser or AI), the merge rule, and the startup order are in `src/entrypoints/popup/CLAUDE.md`. `getPopupBootstrap` is one request: add a field to it, not a second startup query.

## Releasing

Before releasing, hot-fixing, or touching `.github/workflows/clipper-*.yml`, read `docs/releasing.md`. Never add a permission or a content-script `matches` entry casually: a store update that adds one disables the extension until every user re-approves.

## Firefox (JEF-423)

One source again: `pnpm build:firefox` and `pnpm zip:firefox` use the same entrypoints and the manifest from `src/manifest.ts` (`manifest.test.ts`). It differs from Chrome in four ways:

- **Sign-in is the tab flow, like Safari.** Firefox exposes `browser.identity` only when the manifest asks for the permission, so the Firefox manifest has `tabs` and not `identity`, and `supportsWebAuthFlow()` in `lib/api.ts` is false there with no browser check. Do not add `identity`: its `launchWebAuthFlow` redirects to `*.extensions.allizom.org`, which the API would not redirect to, and no extension ID would go in `EXTENSION_OAUTH_IDS`. The API needs only `moz-extension://` in `EXTENSION_ORIGIN_SCHEMES` (its host is a per-install UUID, so CORS matches the scheme).
- **Gecko settings.** `browser_specific_settings.gecko` carries the add-on ID `clipper@trakwyn.com` (`FIREFOX_ADDON_ID`; permanent once published), `strict_min_version` 140 (the first desktop Firefox that reads `data_collection_permissions`) and the data-collection declaration AMO requires of a new add-on. The declaration must match `store/firefox-listing.md`, `store/listing.md` and the privacy policy; change them together. There is no `key`, which is the Web Store's.
- **Background.** MV3 in Firefox is an event page (`background.scripts`), which WXT emits. Nothing in it may assume a service-worker global.
- **No `setAccessLevel`.** Firefox cannot restrict `storage.local` to trusted contexts (`restrictLocalStorageToTrustedContexts` leaves it as is), so on Firefox the "Keep me signed in" refresh token is readable from the content script's isolated world. It is not reachable by the page itself, and the box stays opt-in; do not run page-controlled code in the content script.

Releasing to AMO, and the one-time setup for the job, are in `docs/releasing.md`.

## After launch: compatibility

A store release cannot be rolled back, only replaced, and an installed copy stays on its version until the browser updates it. Two things break it in the field: the API changing under it, and a job board changing its page.

- **API compatibility.** `src/__tests__/graphqlDocuments.test.ts` validates every document in `lib/api.ts` against the API's schema, printed by `pnpm --filter @trakwyn/api schema:print` (no API to boot), so a renamed or removed field fails CI. It extracts documents with `src/__tests__/support/extractGraphqlDocuments.ts`, a copy of mobile's, and reports an interpolation it cannot resolve rather than skipping the document. A new document goes in `lib/api.ts` as a template string, which the test then covers. What the API may and may not change is in `apps/api/CLAUDE.md` ("Client compatibility"); the `*Mobile` mutations are this app's contract.
- **A board changed its page.** Reproduce it first: save the page's markup as a fixture in `src/lib/parsers/__fixtures__` (strip personal data and keep it small), write the failing parser test against it, then fix the parser. The fixtures are how every parser test runs, so the regression stays covered.

Seeing a break, shipping an expedited fix, and Safari's separate release are in `docs/releasing.md`.

- **A downloaded update is applied when the Clipper is idle (JEF-455).** The background listens for `runtime.onUpdateAvailable` and calls `runtime.reload()` (`lib/updateReload.ts`), so a new version takes effect as soon as the browser has downloaded it instead of at the next unload or restart. A reload empties `storage.session` and closes the popup, so it waits while a popup is open (the popup holds a `RUNTIME_PORTS.POPUP` port, `connectPopupPort`), while any sign-in or token refresh is in flight, and while a tab sign-in is pending in `storage.session` (`hasPendingTabOAuth`). The refresh is the one that matters most: the API has already rotated the token, so losing the new one makes the next refresh look like reuse and revokes the session. **Every new sign-in or refresh path in the background must go through `reloader.track`.** It checks again when a popup closes, when tracked work ends, and every `UPDATE_RELOAD_RETRY_MS`. If the background is unloaded while it waits, Chrome installs the update at that unload anyway. Firefox holds an update for a listening extension until it reloads or the browser restarts, so there an update that was waiting when the event page was suspended stays until the next popup, sign-in, refresh or restart wakes it (an abandoned tab sign-in is the case that leaves nothing to wake it). It does not make the browser check for updates sooner, and there is still no minimum-supported-version signal from the API, so a very old Clipper cannot be told to update. If the compatibility rule is kept, that does not matter.

## Testing

Vitest with `WxtVitest()`, which points `wxt/browser` at WXT's in-memory `fakeBrowser`. Call `fakeBrowser.reset()` in `beforeEach`. It does not restore properties a test deletes: `apiAuth.test.ts` removes `identity` to simulate Safari and puts it back itself.
