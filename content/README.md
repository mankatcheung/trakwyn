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

Two weekly Claude Code scheduled tasks on the maintainer's Mac draft new guides and keep the existing ones accurate. They run on a Claude subscription: there is no API key, no GitHub App and no CI job involved. A person always reviews and merges; nothing is published automatically. The prompts are in `content/prompts/`.

**Set up the tasks.** In the Claude Code desktop app, create two scheduled tasks with the Trakwyn repository as the folder, and paste the prompt file as each task's prompt:

| Task             | Prompt                            | Suggested schedule          |
| ---------------- | --------------------------------- | --------------------------- |
| Draft one guide  | `content/prompts/draft-guide.md`  | Weekly, e.g. Monday morning |
| Check the guides | `content/prompts/check-guides.md` | Weekly, e.g. Sunday evening |

The Mac must be awake and signed in to `gh` when a task runs. Both tasks depend on `pnpm guides:capture <slug>` and `pnpm guides:verify <slug>` from JEF-532, and on a working `pnpm setup:worktree`.

**Draft one guide.** Claude reads what shipped in `apps/web` since the newest guide, and either drafts **at most one** guide or stops with "no guide this week". With nothing worth a guide it may take the first topic in `guides/backlog.yml`; it never invents one. It writes the guide's Playwright script (`guide.ts`) first and runs it against the seeded demo account, and a draft whose steps cannot run is never opened. It then opens a draft PR on `chore/guide-<slug>` labelled `guide-draft` and `content`, with `draft: true` in the guide. It skips when two or more `guide-draft` PRs are already open. Because `gh` opens the PR as you, `ci.yml` (gitleaks, `guides-verify`) runs on it.

**How to review a draft.**

1. Read every step against the app. The text must describe only what `guide.ts` does.
2. Check numbers, names and claims. Nothing should be invented, and the demo data names no real company or person.
3. Edit the wording and the screenshots' alt text.
4. Remove `draft: true`, remove the topic from `backlog.yml` if it came from there, and merge. The PR body also lists existing guides the shipped changes affect.

**Run it by hand.** Start Claude Code in the repository and paste the same prompt file, or run the scheduled task from the desktop app.

**Check the guides.** Claude runs every guide script in capture mode. Changed screenshots go into one PR on `chore/guide-screenshots`. A guide whose steps break gets one issue labelled `guide-outdated`, with the error; a guide with an open issue gets no second one. A broken step usually means a real UI change, so fixing the guide is left to a person.

**Add backlog topics.** Append to `content/guides/backlog.yml`:

```yaml
- slug: restore-from-trash # the folder name; must not exist yet
  title: Restore a deleted application from Trash
  feature: Trash # the product feature, in plain words
  notes: Deleted applications are purged after 30 days. # optional: what to cover or avoid
```

`backlogEntrySchema` (`src/index.ts`) checks it in `guideBacklog.test.ts`, including that no slug repeats or already has a guide. The prompts' limits (one draft, two open at most, never `main`, never merge) are held by `guidePrompts.test.ts`, which also checks that no CI workflow calls Claude.

## Where it is read

- `content/src/index.ts`: schema and `parseGuide`, safe in the browser.
- `content/src/node.ts`: Node-only `listGuides()`, used by `apps/web/vite.config.ts` and the tests.
- `apps/web/src/lib/guides.ts`: the build-time loader (`import.meta.glob`). It fails the build on invalid frontmatter, a duplicate slug or an image with no file.
