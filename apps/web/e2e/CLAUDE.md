# Screenshots and guide scripts

Loaded when working under `apps/web/e2e`. The rest of the web notes are in `apps/web/CLAUDE.md`. Paths are relative to `apps/web/` unless stated.

## Running the specs (JEF-656)

`pnpm --filter @trakwyn/web test:e2e` starts both dev servers itself (CI serves built output) with the committed e2e env, so a local run matches CI and does not take the dev values in `apps/api/.env` (`PLANS_ENFORCED=true` locks offers and share links behind a plan).

- **Once per checkout:** `cp apps/api/.env.e2e.example apps/api/.env.e2e`, `cp apps/web/.env.e2e.example apps/web/.env.e2e`, then `pnpm --filter @trakwyn/api db:migrate:e2e`. `pnpm setup:worktree` makes the copies in a worktree, with its ports. Run the migration again after pulling a new one. It fills `apps/api/.pglite-e2e`, kept apart from the dev database, and needs the API stopped (PGlite is one process at a time).
- **`e2eEnv.ts`** reads those two files and hands each server its own; a variable already exported in the shell wins. CI has no `.env.e2e`: its job copies the same templates to `.env` and sets `DATABASE_URL` to Postgres, the only difference.
- **Stop `pnpm dev` first.** `reuseExistingServer` keeps a running server, and it keeps the env it started with.
- **Change a value in the template, not in `ci.yml`.** `ciWorkflow.test.ts` fails on an inline env block.

## Marketing page checks (JEF-681)

Two specs hold the public marketing pages (`/`, `/features`, the four `/features/*` pages, `/pricing`, `/ai-mcp-setup`, `/guides`) to a standard. A new marketing page goes in the `MARKETING_PAGES` list of `a11y.spec.ts` and the `PAGES` list of `marketing-responsive.spec.ts`.

- **`a11y.spec.ts`** runs axe on each page in light and dark. Failures print one line per node (rule, selector, reason) instead of axe's full result.
- **`marketing-responsive.spec.ts`** checks no horizontal scroll at 390, 768 and 1440 in both schemes, alt text on every visible image, 44px header controls on a phone, and the keyboard path through the header, the mobile menu and the FAQ.
- **Lighthouse is not in CI.** To measure: `E2E_PLAIN_BUILD=1 pnpm --filter @trakwyn/web build`, `pnpm --filter @trakwyn/web preview`, then run `lighthouse` (installed outside the repo) against each page. Headless Chrome takes the machine's colour scheme, so state which one you measured.

## Marketing screenshots (JEF-528)

`pnpm --filter @trakwyn/web screenshots` regenerates `public/screenshots/<screen>-<light|dark>.webp` from the seeded demo account. The images are committed, like `public/og-image.png`; CI does not regenerate them.

- **Stop `pnpm dev` first.** The script seeds the database (`db:seed`), and a PGlite database cannot be opened by two processes. `playwright.screenshots.config.ts` never reuses a running server, so it starts its own API and web server on this checkout's ports (`devPorts.ts`) and fails if they are busy.
- **Plans must not be enforced.** The config starts the API with `PLANS_ENFORCED=false`; otherwise analytics shows the locked preview. The spec refuses to capture that preview.
- **Only the demo account is photographed.** After signing in the spec asks the API who `me` is and stops unless it is `demo@trakwyn.app`. It also stops with a message when the API is unreachable.
- **`src/features/marketing/lib/screenshots.ts` is the manifest** (name, per-screen viewport, size, alt-text i18n key). Images are 2x the viewport and must stay under 150 KB; `screenshots.test.ts` checks that each file exists, matches its size and fits the budget. Add a screen there, then rerun the script.
- **Crops (JEF-674):** a screen with `target` and `crop` is an element crop for the features index and the benefit rows. `target` is the value of a `data-screenshot` attribute in the app (never a class), `scene` (default: the screen's name) is the app state `capture.spec.ts` opens first, and the image starts at the element's top-left corner and is `crop` CSS pixels, so it can take in what follows the element. The spec stops when the crop would leave the viewport. Only regions the seeded demo account really shows are cropped: do not seed data for a picture. Three resume and cover letter benefits (drawn from your profile, company briefing, version outcomes) have no real region yet and keep a code mock. Run one with `pnpm screenshots -g crop-board-header`.
- **Marketing seed profile and phone variants (JEF-684):** the script seeds with `SEED_PROFILE=marketing`, which leaves out the "Quota Demo" applications and names the person Maya Chen (`apps/api/src/seed/profile.ts`); the login stays `demo@trakwyn.app`, and the default `pnpm db:seed` keeps both for the quota hints and their tests. A screen with `phoneOf: '<desktop name>'` is its phone variant, captured in a 390 px viewport; `ThemedScreenshot` serves it below `sm` through `<picture>` and `heroPreloadLinks` preloads each size for its own width. Below `md` the section nav is hidden and a section is a screen opened by `?section=`, so `capture.spec.ts` reaches it by URL. Run one with `pnpm screenshots -g crop-board-columns-phone`.
- The spec is outside `e2e/`, so `pnpm test:e2e` and CI never run it. `sharp` (dev dependency) converts Chromium's PNG to WebP and is used only here.

## Guide scripts (JEF-532)

`content/guides/en/<slug>/guide.ts` runs one guide's steps and takes its screenshots. `pnpm guides:verify` checks them (CI's `guides-verify`), `pnpm guides:capture` rewrites the images that changed. The config is `playwright.guides.config.ts`, the helpers and the pixel-diff decision are in `e2e/guides/`, and `e2e/guides/run.sh` seeds the demo account with `SEED_PROFILE=marketing` at a pinned `SEED_NOW` first (JEF-687: the same data as the marketing screenshots, no Quota Demo rows). **`guides:verify` only checks that the steps run; it never compares images** (`differsVisibly` is used by capture only), so a restyle does not fail CI and the guide images go stale until someone reruns `pnpm guides:capture`. How to write one is in `content/README.md`. Like the marketing screenshots, it needs this checkout's ports free.
