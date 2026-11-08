---
name: work-on-ticket
description: Implement a Trakwyn Linear ticket end-to-end — move it to In Progress, work in a worktree under .claude/worktrees, implement only what the ticket says with tests, capture before/after screenshots for UI changes, open a PR, and move the issue to In Review. Use when the user gives a Linear issue key (for example JEF-208) and asks to work on, implement, pick up, or ship it.
model: sonnet
---

# Work on ticket

Given a Linear issue key (for example `JEF-208`). The repo's `CLAUDE.md` is the
source of truth for the Linear lifecycle, branch and worktree naming, test
conventions and PR rules; this skill sequences them. Where they differ, follow
`CLAUDE.md`.

## Steps

1. **Read the ticket.** Fetch the issue with the Linear MCP server
   (`get_issue`, then `list_comments`), and restate the scope in one paragraph.
   Ask before expanding scope. If the ticket is still in Backlog, Planned or
   Todo, that is expected; step 2 moves it.
   - **Name the session.** The agent cannot run `/rename` (it is a
     user-typed command), so right after fetching the issue, and before
     anything else in the reply, print one line in this exact form:
     `Session name: <KEY>-<brief-feature>`, for example
     `Session name: JEF-208-dark-mode-toggle`. Use the uppercase issue key and
     a 2–5 word lowercase kebab-case summary of the feature (not the full
     title; drop filler words), matching the brief name in the branch. Follow
     it with the ready-to-paste `/rename <KEY>-<brief-feature>`. Start the
     narration after that line with the same name, so the job list picks it up.

2. **Set it to In Progress** before any code. Never code while the issue is in
   Backlog, Planned or Todo.

3. **Create the worktree** per `CLAUDE.md`:
   - Branch: `<feat|fix|chore|…>/<lowercase-linear-id>-<brief-name>`, for
     example `feat/jef-67-multi-provider-llm`.
   - Path: `.claude/worktrees/<branch with / replaced by ->`. Never a sibling
     path such as `../trakwyn-<KEY>`.
   - `git worktree add .claude/worktrees/<name> -b <branch> main`, then run
     `pnpm setup:worktree` inside it. Run `terraform init` in any infra root
     the ticket touches.
   - Check `git worktree list` before reusing a worktree path from earlier in
     the session; it may have moved.

4. **Capture "before" screenshots (UI tickets only; before any code change).**
   Decide which surfaces the ticket changes: **web** and/or **mobile app**.
   Skip surfaces it does not touch (API, CLI, extension-only work) and say
   "Skipping before/after: <reason>" in one line. For each touched surface,
   screenshot the changed flow on the untouched base. Keep files in the job
   tmp dir or `$TMPDIR`, never in the repo. Do not start step 5 until this is
   done or explicitly skipped.
   - **Web:** Playwright against the dev servers, at **wide (1440px)** and
     **narrow (390px)**.
   - **Mobile:** real app screens on a simulator or emulator
     (`xcrun simctl io booted screenshot`, or Maestro `takeScreenshot` per
     `apps/mobile/.maestro/README.md`). Same screens before and after.
   - Name files `<key>-<surface>-<viewport-or-screen>-before.png`, for example
     `jef-208-web-wide-before.png`.

5. **Implement only what the ticket describes.**
   - Follow the new-feature order and layering rules in `CLAUDE.md`, and read
     the nested `CLAUDE.md` of each app you touch.
   - **Tests ship in the same PR** for every new or changed use case,
     resolver, repository, component/page or utility, following the existing
     convention for that layer. An unchecked "tests" item means the issue is
     not done.

6. **Run the full test suite, lint and typecheck:** `pnpm test`,
   `pnpm lint`, `pnpm typecheck` from the monorepo root. Report failures with
   their output; do not hide or skip them.

7. **Capture "after" screenshots** of exactly the same screens, viewports and
   states as step 4, named `...-after.png`. Check no real user data or secrets
   are on screen.

8. **Build a Before / After PDF** (mandatory when step 4 was not skipped):
   - Write a throwaway HTML page in the job tmp dir (never the repo): ticket
     key and a one-line summary, then a section per surface (Web wide, Web
     narrow, Mobile screens) with each before/after pair side by side and
     labelled. Embed the PNGs as `data:` URIs or local `file://` paths.
   - Render with Playwright
     (`page.pdf({ format: 'A4', landscape: true, printBackground: true })`),
     one surface per page where it fits, named `<key>-before-after.pdf`. Open
     it (Read with `pages`) and confirm every image is present and legible.
   - **Upload it to Linear** (`prepare_attachment_upload` /
     `create_attachment_from_upload`, title "Before / After") and **comment on
     the issue** with `save_comment` linking it. Confirm the comment exists.
   - GitHub cannot render a PDF from a PR body, so put the Linear attachment
     link under `## Before / After` in the PR and say so.

9. **Check the diff.** `git status`: confirm every intended file is staged
   (assets, LICENSE, migrations included). Screenshots stay out of the repo.

10. **Commit, push, open the PR** (with the Before / After link when
    screenshots exist), then set the Linear issue to **In Review** with the PR
    link. Verify the PDF comment is on the issue. The user reviews PRs
    directly and does not merge from the CLI, so do not merge. Do not set the
    issue to Done; that happens after the merge or when the user asks.
