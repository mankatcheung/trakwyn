# content

Marketing content kept in git (JEF-531). There is no CMS: open a PR, review it, merge to publish. A merge that only touches `content/` still deploys the web app (`ci.yml` watches `content/**`).

## Add a guide

Create `content/guides/en/<slug>/index.md` and put its screenshots in the same folder. No code changes are needed: the loader, the `/guides` pages, the RSS feed, `/sitemap.xml` and the prerender list all read this folder.

```md
---
title: Track your first job application
description: One sentence for search results and link previews (200 characters at most).
date: 2026-11-08
updated: 2026-12-01 # optional
tags: [getting-started, tracking]
feature: /features/tracking # optional: a /features page to link to
draft: true # optional: see below
---

Markdown body. Use `##` for sections; the page title is the `title` above.

![What the screenshot shows](./board.webp)
```

- The **slug** is the folder name: lowercase words joined by single hyphens. It becomes `/guides/<slug>`.
- Frontmatter is checked by `guideFrontmatterSchema` (`src/index.ts`). An unknown key, a bad date or an empty `tags` list fails the build and the tests.
- Write interface-free prose: guide text stays exactly as written and is not translated. The locale folder (`en`) is there for later.

## Images

- Reference an image by relative path only (`./name.webp`). The `img` override in `GuideMarkdown` is the only code that turns it into a URL, so moving to an image host later is a one-function change.
- Every image is **WebP, 1600 × 1000 px (16:10)**, at most **300 KB**. `content/` as a whole stays under **50 MB**.
- Every image needs alt text, and every file in a guide folder must be referenced by its `index.md`.
- Screenshots are stored in plain git, not Git LFS. Take them from the seeded demo account (`demo@trakwyn.app`), never from a real one. `pnpm guides:capture` takes them for you (below); by hand, a 1280 × 800 window at a 1.25 device scale factor gives the right size.

These rules are enforced by `apps/web/src/__tests__/content/guideContent.test.ts`.

## Drafts

`draft: true` shows a guide in `pnpm dev` only. It is left out of the production pages, the prerender list, `/sitemap.xml` and the RSS feed. The file is still in the repository, so do not put anything secret in a draft.

## Where it is read

- `content/src/index.ts`: schema and `parseGuide`, safe in the browser.
- `content/src/node.ts`: Node-only `listGuides()`, used by `apps/web/vite.config.ts` and the tests.
- `apps/web/src/lib/guides.ts`: the build-time loader (`import.meta.glob`). It fails the build on invalid frontmatter, a duplicate slug or an image with no file.

## Writing a guide script

Every guide has a `guide.ts` next to its `index.md` (JEF-532). It is a Playwright script that signs in as the seeded demo account, clicks through the guide's steps and takes the screenshots, so a guide that describes a button that no longer exists fails a check instead of misleading readers. `content.test` fails a guide with no `guide.ts`.

```ts
import {
  expect,
  field,
  shot,
  signInAsDemo,
  t,
  test,
} from '../../../../apps/web/e2e/guides/helpers';

test('Track your first job application', async ({ page }) => {
  await signInAsDemo(page);
  await page.getByRole('link', { name: t('nav.applications'), exact: true }).click();
  await expect(page.getByText('TechCorp').first()).toBeVisible();
  await shot(page, 'applications-list'); // ./applications-list.webp in index.md
});
```

- **Helpers** (`apps/web/e2e/guides/helpers.ts`): `signInAsDemo(page)` (refuses to continue as anyone else), `t(key)` (the English text of an i18n key), `field(page, label)` (the input under a form label), and `shot(page, name, { locator?, mask? })`. Find elements by role and `t()` text wherever possible, so a renamed button fails verify.
- **`shot` names** must be literals, and must match the `./<name>.webp` images in `index.md` one to one. `guideScripts.test.ts` checks both directions, and `shot` checks the name again at run time.
- **Verify** (`pnpm guides:verify`) runs the steps and writes nothing. CI runs it on every pull request that touches `content/**` or `apps/web/**` (`guides-verify`, part of `ci-ok`).
- **Capture** (`pnpm guides:capture`) also writes the images, but only those that changed visibly (more than 0.1% of pixels), so a rerun with no UI change leaves `git status` clean. Commit the images that changed with the UI change.
- **Same output every run:** both modes seed the demo account first, pinned to one instant (`GUIDES_NOW` in `apps/web/e2e/guides/run.sh`, passed to the seed as `SEED_NOW`) that the page clock is frozen to, use a fixed 1280 × 800 viewport at 1.25x, reduced motion, the fake LLM provider and local storage. If a guide needs data the seed lacks, add it to `apps/api/src/seed/`, not to the script.
- **Run locally** with `pnpm dev` stopped: the config starts its own API and web server (ports 3000 and 3001) and fails if they are busy.
