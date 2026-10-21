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

**Google/GitHub sign-in** runs in the background (the popup closes when the sign-in opens) and is chosen by feature detection in `lib/api.ts`:

- **Chrome** (`identity` present, JEF-383): `launchWebAuthFlow` to `…/start?platform=extension&extensionId=…`, handed back on `https://<id>.chromiumapp.org/`. The ID must be in the API's `EXTENSION_OAUTH_IDS`. A Web Store build has its own permanent ID (the unpacked ID differs, since Chrome derives it from the folder), so create the draft listing first, take the ID from the dashboard and add it to the production `EXTENSION_OAUTH_IDS` (`infra/gcp`) before the listing goes live, or Chrome sign-in fails for every user.
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

## Reading a posting: built-in or AI (JEF-420)

The popup shows two buttons on a job page (`ReadButtons`): **Read with parser** and **Read with AI**. The user chooses per clip; there is no stored setting and no options screen for it. The popup opens on the built-in result.

- **Parser** is the content script's parsers (`GET_JOB_DATA`). **AI** adds `GET_PAGE_TEXT` (`lib/parsers/pageText.ts`: the main area's text, else the body, capped at `PAGE_TEXT_MAX_CHARS`, the API's `JOB_POSTING_MAX_CHARS`), then the existing `parseJobDescription(text)` mutation (`lib/api.ts`, via `lib/aiRead.ts`). No API change, and no new permission: it works only on the boards the content script matches.
- **"Read with AI" is disabled without a default AI key.** `hasDefaultAiKey` (`lib/api.ts`) asks `me { defaultLlmProvider }` and `llmApiKeys { provider }` once as the popup opens and is true only when the default provider has a saved key (a default whose key was deleted would fail with `AI_NOT_CONFIGURED` only after the page text was sent). The disabled button links to the web app's `/settings/ai`. A failed check reads as "no key"; the parser still works.
- **Merge rule** (`lib/parsers/mergeAiResult.ts`): the user asked for the AI, so its answer replaces the parser's for every field it gave; a null or blank AI field never overwrites a parsed one. It merges into the parser's result (`Clip.builtin`), not into an earlier AI read. A clip the AI changed is editable in `ClipCard` before saving, since AI output is a suggestion. **Read with parser** drops the AI result and reads the page again.
- **Failure is never a dead end.** `AI_NOT_CONFIGURED`, `AI_LIMIT_REACHED`, `AI_PROVIDER_ERROR`, `AI_RESPONSE_INVALID` and `RATE_LIMITED` get their own copy (`AI_ERROR_MESSAGES`); the popup keeps the clip and shows a dismissible notice.
- **Privacy.** Only pressing **Read with AI** sends the page's text, to the user's own LLM provider through Trakwyn's API. Page text and the result are never reported to PostHog; `parser_result` is unchanged.

## After launch: compatibility and hotfixes (JEF-417)

A store release cannot be rolled back, only replaced, and an installed copy stays on its version until the browser updates it. Two things break it in the field: the API changing under it, and a job board changing its page.

- **API compatibility.** `src/__tests__/graphqlDocuments.test.ts` validates every document in `lib/api.ts` against the API's schema, printed by `pnpm --filter @trakwyn/api schema:print` (no API to boot), so a renamed or removed field fails CI. It extracts documents with `src/__tests__/support/extractGraphqlDocuments.ts`, a copy of mobile's, and reports an interpolation it cannot resolve rather than skipping the document. A new document goes in `lib/api.ts` as a template string, which the test then covers. What the API may and may not change is in `apps/api/CLAUDE.md` ("Client compatibility"); the `*Mobile` mutations are this app's contract.
- **Seeing a break.** The Clipper health dashboard (`infra/posthog/README.md`, "Clipper health") charts `parser_result` per board and the API, refresh and sign-in failures per `release`, and alerts when one board's parser results pass a daily count.
- **A board changed its page.** Reproduce it first: save the page's markup as a fixture in `src/lib/parsers/__fixtures__` (strip personal data and keep it small), write the failing parser test against it, then fix the parser. The fixtures are how every parser test runs, so the regression stays covered.
- **Shipping an expedited fix.**
  1. Land the fix as a `fix(extension): …` commit. release-please opens the Clipper release PR (root `CLAUDE.md`); merge it to bump the version and tag `clipper-v…`.
  2. Build the zip without a local `.env` (a stray `VITE_API_URL` is baked into the bundle) and with the public `VITE_POSTHOG_KEY` set: `pnpm --filter @trakwyn/extension zip`.
  3. Upload it in the Web Store dashboard (**Package → Upload new package**) and submit for review. The new version number must be higher than the live one.
  4. Ask for an expedited review through Chrome Web Store developer support. Nothing guarantees it, and an ordinary review can take days, so assume the broken version stays live that long. Do not promise users a date.
  5. After it is published, watch the dashboard's `release` split: the fix is working when the old version's line stops growing and the new one's stays flat. Installed copies update on the browser's own schedule, which can take days more.
- **Safari ships separately.** It goes through the App Store and its own review (`package:safari`, above), so a parser fix reaches Safari users later than Chrome users. It reports under the same `release`.
- **No forced update.** There is no minimum-supported-version signal from the API, so a very old Clipper cannot be told to update. If the compatibility rule is kept, that does not matter.

## Testing

Vitest with `WxtVitest()`, which points `wxt/browser` at WXT's in-memory `fakeBrowser`. Call `fakeBrowser.reset()` in `beforeEach`. It does not restore properties a test deletes: `apiAuth.test.ts` removes `identity` to simulate Safari and puts it back itself.
