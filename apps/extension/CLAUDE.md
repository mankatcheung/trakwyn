# apps/extension — subsystem notes

Loaded when working under `apps/extension`, the Trakwyn Clipper. Paths below are relative to `apps/extension/`.

## Build (WXT, JEF-386)

One source, one MV3 manifest per browser, from `wxt.config.ts`. Entrypoints are in `src/entrypoints/` (`popup/`, `background.ts`, `content.ts`); shared code is in `src/lib/`. Content-script `matches` live in `content.ts`'s `defineContentScript`, not the config.

```bash
pnpm dev             # build + watch Chrome into .output/chrome-mv3-dev (no browser launch); dev server on :3002
pnpm build           # Chrome  -> .output/chrome-mv3
pnpm build:safari    # Safari  -> .output/safari-mv3
pnpm package:safari  # build:safari, then (re)generate the Xcode project in safari/
```

- Load Chrome from `.output/chrome-mv3` (chrome://extensions → Load unpacked).
- **Safari:** open `safari/Trakwyn Clipper/Trakwyn Clipper.xcodeproj`, run the "Trakwyn Clipper" scheme, then in Safari enable Develop → Allow Unsigned Extensions and turn the Clipper on in Settings → Extensions. The project references `.output/safari-mv3` in place, so after the first `package:safari` a `build:safari` plus an Xcode rebuild picks up changes. Re-run `package:safari` only to regenerate the project (e.g. a new permission). The bundle ID `com.trakwyn.clipper` is a placeholder until the App Store release.
- **Version (JEF-389):** `package.json` holds it and release-please bumps it; `wxt.config.ts` sets none, so WXT writes that number into both manifests. Releasing is merging the Clipper's release PR (root `CLAUDE.md`), then building and uploading by hand: see "Releasing the Clipper" below. The Xcode project's `MARKETING_VERSION` is a committed copy that `package:safari` rewrites from `package.json`. A release PR does not touch it, so run `package:safari` after merging one and before a Safari build.
- **API URL (JEF-412, JEF-419):** `DEFAULT_API_URL` is `API_URLS.DEVELOPMENT` (localhost) only under `pnpm dev`, and `VITE_API_URL` at build time everywhere else (`.env.example`). The production URL is not in the source: the release workflow reads it from the `CLIPPER_API_URL` repository variable, and a non-dev build without `VITE_API_URL` has an empty URL and every request fails (`resolveDefaultApiUrl` cannot throw, because `wxt prepare` imports it with no variable set). `apiUrls.ts` is separate from `constants.ts` because `wxt.config.ts` imports it in Node, where `import.meta.env` is undefined. There is no options page and no user-set URL (JEF-418): the first store version has no settings screen, so the extension talks only to the API it was built for.
- **Manifest (JEF-412):** `src/manifest.ts` builds it for both browsers (`manifest.test.ts`). **A production build has no `host_permissions`:** only `pnpm dev` adds the local API. This is deliberate, because a host permission added in an update disables the extension until every user re-approves it, so the first store version has to be right.
  - The API needs none: `corsPlugin.ts` lets any `chrome-extension://` or `safari-web-extension://` origin through and sets no header allow-list, and the Clipper sends bearer tokens, not cookies. If a proxy ever strips those CORS headers, add `optional_host_permissions` for it; an _optional_ permission can be added in any update without re-prompting.
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
  - **The Web Store ID is `pnpgngnojencbggokjhpfhmliijakmhe`** (JEF-415), owned by an individual developer account's publisher, not a group publisher. It is permanent for the listing. It goes in production `EXTENSION_OAUTH_IDS`; the dashboard URL is `…/devconsole/<publisher>/pnpgngnojencbggokjhpfhmliijakmhe/edit`.
- **Safari** (no `identity` API, JEF-386): `lib/tabOAuth.ts` opens `…/start?platform=extension-tab` in a tab and watches it until it lands on the API's `/auth/oauth/extension/done`, then closes it. Safari may unload the background mid-login, so the login (tab ID, PKCE verifier and "Keep me signed in" choice) is also in `storage.session`, and `registerTabOAuthListeners` is registered when the background starts so a restarted one can still finish it. This is why the Safari manifest has `tabs`.

Either way, the handoff code is redeemed with `exchangeMobileOAuthCode` and this login's PKCE verifier.

## Error reporting (JEF-387)

The Clipper reports faults to the same PostHog project as web and mobile, through `lib/observability/`. These points are load-bearing:

- **Off by default.** Without `VITE_POSTHOG_KEY` at build time (`.env.example`) no request is made, which is the intended state in dev and CI. The key is the public `phc_` one, inlined into the bundle like web's.
- **No SDK.** `report.ts` posts to PostHog's capture endpoint with `fetch`, as web's Vercel function does. `posthog-js` needs a `window` and `localStorage`, which the background service worker has neither of. PostHog answers the CORS preflight for extension origins, so the manifest has no PostHog host permission; adding one would prompt every user on update.
- **No person, no consent gate.** Reports are operational data, not analytics: `$process_person_profile: false`, a random `distinct_id` per event, `$geoip_disable`, and nothing stored between reports. Only faults are sent. A product event (a clip saved, a sign-in) would need a consent decision first. The reasoning is in `infra/posthog/README.md` ("Browser extension errors").
- **Two contexts report: `background` and `popup`.** Each entrypoint calls `initObservability` first, which adds the `error` and `unhandledrejection` listeners; the popup also sits in `ErrorBoundary`. The content script never reports and has no listeners: on LinkedIn's page they would catch LinkedIn's errors.
- **What is sent.** `$exception` for bugs; `graphql_request_failed` for an unreachable API or a 5xx (never a 4xx or a domain code, the same rule as web and mobile); `token_refresh_failed` and `oauth_login_failed` with a `reason`; `parser_result` when a job's page on a known board gave the parsers less than a clip needs (on LinkedIn and Indeed, only when the URL names a job, so a search page is not a fault). `ApiError` is the API answering, so it is shown to the user and not reported. An error `gql` reported is marked (`markReported`), so no caller reports it again.
- **What is never sent.** Tokens, the email, the OAuth handoff code, the PKCE verifier, GraphQL variables, job content, or a page URL. `parser_result` names the board (`JOB_BOARDS` in `constants.ts`), not the hostname, because a Workday or Greenhouse hostname carries the employer's name. Everything passes `scrub.ts`, a copy of web's that `scrubParity.test.ts` holds identical.
- **`traceparent` goes to the API only**, on every `gql` request. The same id is the `trace_id` on that request's failure event and on the next exception, which links a PostHog report to its Axiom trace.
- **A report never throws or retries.** A failed send is dropped.

## Reading a posting: built-in or AI (JEF-420)

The popup shows two buttons on a job page (`ReadButtons`): **Read with parser** and **Read with AI**. The user chooses per clip; there is no stored setting for it. The popup opens on the built-in result.

- **Parser** is the content script's parsers (`GET_JOB_DATA`). **AI** adds `GET_PAGE_TEXT` (`lib/parsers/pageText.ts`: the main area's text, else the body, capped at `PAGE_TEXT_MAX_CHARS`, the API's `JOB_POSTING_MAX_CHARS`), then the existing `parseJobDescription(text)` mutation (`lib/api.ts`, via `lib/aiRead.ts`). No API change, and no new permission: it works only on the boards the content script matches.
- **"Read with AI" is disabled without a default AI key.** `hasDefaultAiKey` (`lib/api.ts`) asks `me { defaultLlmProvider }` and `llmApiKeys { provider }` once as the popup opens and is true only when the default provider has a saved key (a default whose key was deleted would fail with `AI_NOT_CONFIGURED` only after the page text was sent). The disabled button links to the web app's `/settings/ai`. A failed check reads as "no key"; the parser still works.
- **Merge rule** (`lib/parsers/mergeAiResult.ts`): the user asked for the AI, so its answer replaces the parser's for every field it gave; a null or blank AI field never overwrites a parsed one. It merges into the parser's result (`Clip.builtin`), not into an earlier AI read. A clip the AI changed is editable in `ClipCard` before saving, since AI output is a suggestion. **Read with parser** drops the AI result and reads the page again.
- **Failure is never a dead end.** `AI_NOT_CONFIGURED`, `AI_LIMIT_REACHED`, `AI_PROVIDER_ERROR`, `AI_RESPONSE_INVALID` and `RATE_LIMITED` get their own copy (`AI_ERROR_MESSAGES`); the popup keeps the clip and shows a dismissible notice.
- **Privacy.** Only pressing **Read with AI** sends the page's text, to the user's own LLM provider through Trakwyn's API. Page text and the result are never reported to PostHog; `parser_result` is unchanged.

## Releasing the Clipper (JEF-418)

Web Store ID `pnpgngnojencbggokjhpfhmliijakmhe`. A published version can never be rolled back, only replaced by a higher one, and review takes hours to days, so the first public release is staged and every later one follows the same steps. From JEF-419 the release workflow builds the zip and uploads a **draft** (below); a person still submits and publishes it.

1. **Pick the version.** release-please proposes it from the commit types since the last `clipper-v…` tag (root `CLAUDE.md`). To force one, set `"release-as"` on `apps/extension` in `release-please-config.json`; the release PR then proposes exactly that, and **the entry must be removed in the next PR after the release is tagged**, or the next release is forced to the same number. A `Release-As:` footer is not reliable here: the one on #1017's squash commit was ignored (release-please went on proposing `0.3.0`). The first public release is **1.0.0**, forced this way (JEF-418). Never edit a version or `CHANGELOG.md` by hand.
2. **Merge the Clipper's release PR.** It bumps `package.json` and `CHANGELOG.md`, and the workflow tags `clipper-v<version>` and creates the GitHub Release. Check that the PR touches only those two files.
3. **CI builds and uploads the draft (JEF-419).** Merging the release PR starts the `clipper-store` job in `.github/workflows/release.yml`, only when release-please reports a Clipper release. It checks out the `clipper-v<version>` tag, builds with `VITE_POSTHOG_KEY` from the repository variable `CLIPPER_POSTHOG_KEY` (the public project key, `terraform -chdir=infra/posthog output -raw project_api_key`) and `VITE_API_URL` from the repository variable `CLIPPER_API_URL` (the full production `/graphql` URL, so the URL lives in repository settings and not in the workflow), and fails unless the bundle contains that URL, the manifest's `version` equals the tag and it has no `host_permissions`. It then attaches `trakwynextension-<version>-chrome.zip` to the GitHub Release and runs `wxt submit --chrome-skip-submit-review`, which uploads the package to the existing listing without submitting it for review or publishing it. If the job fails before the upload, fix the cause and re-run it from the Actions tab: nothing reached the store. If it fails at the upload, check the dashboard before re-running, since the store refuses a version it has already seen.
4. **Check the package** (the release asset, or `.output/trakwynextension-<version>-chrome.zip` after a local build). In its `manifest.json`: `key` is the listing's public key (`manifest.ts`), `permissions` are `storage`, `activeTab` and `identity`. The job already checks `version` and `host_permissions`; it cannot judge permissions or content-script `matches`. If either grew, the store disables the extension for every user until they re-approve it: do not ship that by accident. The bundle's only `localhost` is the unused development default in `apiUrls.ts`.
5. **Submit.** In the dashboard, open the uploaded draft and submit it for review. For the first release set the distribution to **Unlisted** or **Trusted testers**, and turn **deferred publishing** on, so approval does not publish. If review asks about a permission, answer from `store/listing.md`; the data-use answers there must still match the privacy policy and what the build does (tokens, `storage`, what is sent), so change them together whenever the Clipper's storage or network use changes.
6. **Verify the approved build from the store**, not an unpacked one: open the store link in a clean Chrome profile, install, then sign in with Google and with GitHub against production and clip a job from LinkedIn and from one other board. Check the extension's ID is the one above.
7. **Go public, staged.** Set visibility to **Public** and publish with a staged rollout percentage. Raise it only while the Clipper health dashboard (`infra/posthog/README.md`) stays quiet for the new `release`: `graphql_request_failed`, `token_refresh_failed`, `oauth_login_failed` and `parser_result`. A later release can skip the restricted audience, but keep the staged rollout.
8. **Confirm** the published version is the tag's. Installed copies update on the browser's own schedule, so the old version stays in use for days: that is why the API keeps old clients working (`apps/api/CLAUDE.md`, "Client compatibility").

### Web Store credentials for the upload job

The job reads four repository secrets, all from the Chrome Web Store API (API v1.1, an OAuth client of type Desktop in a Google Cloud project with the Chrome Web Store API enabled): `CHROME_EXTENSION_ID` (the ID above), `CHROME_CLIENT_ID`, `CHROME_CLIENT_SECRET` and `CHROME_REFRESH_TOKEN`. Run `pnpm --filter @trakwyn/extension exec wxt submit init` locally to create the client and print the refresh token, and set the secrets with `gh secret set`. The refresh token stops working if the OAuth consent screen is left in _Testing_ (it expires after 7 days; publish the app to _In production_), if the Google account's password changes or it is revoked, or after six months unused. To renew, re-run `wxt submit init` and replace `CHROME_REFRESH_TOKEN`. `wxt submit --dry-run` checks the credentials without uploading. The credentials belong to the account that owns the listing, so use one that cannot be locked out. These are plain Actions secrets, not a GitHub App: only the store call needs them, and the job runs inside the release workflow, so the `GITHUB_TOKEN` limitation in `release.yml` does not apply. Publishing stays manual for every release (patch or not) so the staged rollout is chosen by a person.

Safari is a separate release through the App Store (`package:safari`, above) and is not covered here.

## After launch: compatibility and hotfixes (JEF-417)

A store release cannot be rolled back, only replaced, and an installed copy stays on its version until the browser updates it. Two things break it in the field: the API changing under it, and a job board changing its page.

- **API compatibility.** `src/__tests__/graphqlDocuments.test.ts` validates every document in `lib/api.ts` against the API's schema, printed by `pnpm --filter @trakwyn/api schema:print` (no API to boot), so a renamed or removed field fails CI. It extracts documents with `src/__tests__/support/extractGraphqlDocuments.ts`, a copy of mobile's, and reports an interpolation it cannot resolve rather than skipping the document. A new document goes in `lib/api.ts` as a template string, which the test then covers. What the API may and may not change is in `apps/api/CLAUDE.md` ("Client compatibility"); the `*Mobile` mutations are this app's contract.
- **Seeing a break.** The Clipper health dashboard (`infra/posthog/README.md`, "Clipper health") charts `parser_result` per board and the API, refresh and sign-in failures per `release`, and alerts when one board's parser results pass a daily count.
- **A board changed its page.** Reproduce it first: save the page's markup as a fixture in `src/lib/parsers/__fixtures__` (strip personal data and keep it small), write the failing parser test against it, then fix the parser. The fixtures are how every parser test runs, so the regression stays covered.
- **Shipping an expedited fix.**
  1. Land the fix as a `fix(extension): …` commit and follow "Releasing the Clipper" above: merge the release PR, build from the tag, upload, submit. Skip the restricted audience and keep the staged rollout.
  2. Check that no permission or content-script host was added (a re-approval prompt disables it for everyone).
  3. Upload it in the Web Store dashboard and submit for review. The new version number must be higher than the live one.
  4. Ask for an expedited review through Chrome Web Store developer support. Nothing guarantees it, and an ordinary review can take days, so assume the broken version stays live that long. Do not promise users a date.
  5. After it is published, watch the dashboard's `release` split: the fix is working when the old version's line stops growing and the new one's stays flat. Installed copies update on the browser's own schedule, which can take days more.
- **Safari ships separately.** It goes through the App Store and its own review (`package:safari`, above), so a parser fix reaches Safari users later than Chrome users. It reports under the same `release`.
- **No forced update.** There is no minimum-supported-version signal from the API, so a very old Clipper cannot be told to update. If the compatibility rule is kept, that does not matter.

## Testing

Vitest with `WxtVitest()`, which points `wxt/browser` at WXT's in-memory `fakeBrowser`. Call `fakeBrowser.reset()` in `beforeEach`. It does not restore properties a test deletes: `apiAuth.test.ts` removes `identity` to simulate Safari and puts it back itself.
