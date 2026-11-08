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
- Screenshots are stored in plain git, not Git LFS. Take them from the seeded demo account (`demo@trakwyn.app`), never from a real one. A 1280 × 800 window at a 1.25 device scale factor gives the right size.

These rules are enforced by `apps/web/src/__tests__/content/guideContent.test.ts`.

## Drafts

`draft: true` shows a guide in `pnpm dev` only. It is left out of the production pages, the prerender list, `/sitemap.xml` and the RSS feed. The file is still in the repository, so do not put anything secret in a draft.

## Automated drafts (JEF-533)

Claude drafts guides, and a weekly job keeps the existing ones accurate. A person always reviews and merges; nothing is published automatically.

**What triggers it.** When a `web-v*` release is created, `release.yml` calls `guides-draft.yml`. Claude reads the `feat:` commits and diff since the previous web tag, plus `apps/web/CHANGELOG.md`, the existing guides and `guides/backlog.yml`. It drafts **at most one** guide, or decides none is worth writing. With nothing worth a guide in the release it may take the first backlog topic; it never invents one. It runs Sonnet 5.5 with a cap of 40 turns, and skips when two or more PRs labelled `guide-draft` are open.

**What you get.** A draft PR on `chore/guide-<slug>` labelled `guide-draft` and `content`, with `draft: true` in the guide. The guide's steps are a Playwright script (`guide.ts`) that ran against the seeded demo account, and `pnpm guides:verify` is run again by the workflow, so a draft whose steps cannot run is never opened. The PR is opened with a GitHub App token, so the full `ci.yml` runs on it.

**How to review a draft.**

1. Read every step against the app. The text must describe only what `guide.ts` does.
2. Check numbers, names and claims. Nothing should be invented, and the demo data names no real company or person.
3. Edit the wording and the screenshots' alt text.
4. Remove `draft: true`, remove the topic from `backlog.yml` if it came from there, and merge. The PR body also lists existing guides the release affects.

**Run it by hand.** Actions → Draft guide → Run workflow, with an optional `tag` (default: the latest web tag) and `since_tag`.

**Add backlog topics.** Append to `content/guides/backlog.yml`:

```yaml
- slug: restore-from-trash # the folder name; must not exist yet
  title: Restore a deleted application from Trash
  feature: Trash # the product feature, in plain words
  notes: Deleted applications are purged after 30 days. # optional: what to cover or avoid
```

`backlogEntrySchema` (`src/index.ts`) checks it in `guideBacklog.test.ts`, including that no slug repeats or already has a guide.

**Weekly freshness.** `guides-freshness.yml` runs every Monday at 06:00 UTC (and on demand). It runs each guide script in capture mode, with no Claude. Changed screenshots go into one PR on `chore/guide-screenshots`. A guide whose steps break gets one issue labelled `guide-outdated`, with the error and a link to the run's trace; a guide with an open issue gets no second one. A broken step usually means a real UI change, so fixing the guide is left to a person.

**One-time setup.** Create a GitHub App with contents, pull requests and issues write access, install it on the repository, and store `GUIDES_APP_ID`, `GUIDES_APP_PRIVATE_KEY` and `ANTHROPIC_API_KEY` as repository secrets. The workflows depend on `pnpm guides:capture <slug>` and `pnpm guides:verify <slug>` from JEF-532.

## Where it is read

- `content/src/index.ts`: schema and `parseGuide`, safe in the browser.
- `content/src/node.ts`: Node-only `listGuides()`, used by `apps/web/vite.config.ts` and the tests.
- `apps/web/src/lib/guides.ts`: the build-time loader (`import.meta.glob`). It fails the build on invalid frontmatter, a duplicate slug or an image with no file.
