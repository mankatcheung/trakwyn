# Screenshots and guide scripts

Loaded when working under `apps/web/e2e`. The rest of the web notes are in `apps/web/CLAUDE.md`. Paths are relative to `apps/web/` unless stated.

## Marketing screenshots (JEF-528)

`pnpm --filter @trakwyn/web screenshots` regenerates `public/screenshots/<screen>-<light|dark>.webp` from the seeded demo account. The images are committed, like `public/og-image.png`; CI does not regenerate them.

- **Stop `pnpm dev` first.** The script seeds the database (`db:seed`), and a PGlite database cannot be opened by two processes. `playwright.screenshots.config.ts` never reuses a running server, so it starts its own API and web server on this checkout's ports (`devPorts.ts`) and fails if they are busy.
- **Plans must not be enforced.** The config starts the API with `PLANS_ENFORCED=false`; otherwise analytics shows the locked preview. The spec refuses to capture that preview.
- **Only the demo account is photographed.** After signing in the spec asks the API who `me` is and stops unless it is `demo@trakwyn.app`. It also stops with a message when the API is unreachable.
- **`src/features/marketing/lib/screenshots.ts` is the manifest** (name, per-screen viewport, size, alt-text i18n key). Images are 2x the viewport and must stay under 150 KB; `screenshots.test.ts` checks that each file exists, matches its size and fits the budget. Add a screen there, then rerun the script.
- The spec is outside `e2e/`, so `pnpm test:e2e` and CI never run it. `sharp` (dev dependency) converts Chromium's PNG to WebP and is used only here.

## Guide scripts (JEF-532)

`content/guides/en/<slug>/guide.ts` runs one guide's steps and takes its screenshots. `pnpm guides:verify` checks them (CI's `guides-verify`), `pnpm guides:capture` rewrites the images that changed. The config is `playwright.guides.config.ts`, the helpers and the pixel-diff decision are in `e2e/guides/`, and `e2e/guides/run.sh` seeds the demo account at a pinned `SEED_NOW` first. How to write one is in `content/README.md`. Like the marketing screenshots, it needs this checkout's ports free.
