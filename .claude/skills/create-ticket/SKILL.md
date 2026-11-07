---
name: create-ticket
description: Turns a rough idea, feature request, or bug report for Trakwyn into a fully scoped Linear issue — problem/motivation, in/out of scope, a concrete implementation plan grounded in the real code, acceptance criteria — and creates it in the Trakwyn project, assigned to Jeff and labelled. Use whenever the user describes something they want built or fixed in this repo and asks to "turn this into a ticket/issue", "create a ticket", "file a ticket for X", "scope this out", or similar. After creating the issue, hands back the exact `/rename` command for the session.
model: opus
---

# Create ticket

Converts a loose idea into a scoped Linear issue with an implementation plan,
then hands the user a ready-to-run `/rename` command for the session.

## Linear defaults for this repo

Every issue this skill creates gets all of these. They are specific to the
Trakwyn Linear workspace, so do not carry them over to other repos.

- **Team:** `Trakwyn` (key `JEF`). It is the only team; do not ask.
- **Project:** `Trakwyn`. Not `Visa Calculator`.
- **Assignee:** Jeff, via `assignee: "me"` (the connector is signed in as Jeff).
- **Labels:** exactly one type label, plus a topic label when one fits.
  - Type, pick one: `Bug` (something is broken), `Feature` (something new),
    `Improvement` (a change to something that already exists).
  - Topic, optional: `AI` (LLM, chat, prompts, providers), `Analytics`
    (PostHog, Axiom, metrics).
  - Do not set `Idea`, `Planning` or `Planned` unless the user asks. They mark
    workflow stages, not the kind of work.
- **Status:** leave the team default. The repo's lifecycle (see `CLAUDE.md`)
  moves it to In Progress only when work starts.

Before creating, confirm the names still exist with `list_projects` and
`list_issue_labels`. If one is gone or renamed, say so and stop rather than
guessing or inventing a label.

## Workflow

### 1. Understand the idea

Read the request. If it is genuinely ambiguous (unclear goal, unclear part of
the codebase, unclear boundaries), ask up to 3 short, specific questions before
drafting. If it is clear enough to scope, go straight to step 2.

### 2. Investigate before scoping

Ground the plan in the code. Use `Grep`/`Glob`/`Read` to find the files,
modules and use cases the change would touch.

- The root `CLAUDE.md` gives the layering and the new-feature order (domain
  entity, port, use case, repository, Pothos type/resolver, query/mutation, DI
  registration, web `.graphql`, codegen, UI). Follow it when sequencing steps.
- Read the nested `CLAUDE.md` for each app the change touches
  (`apps/api`, `apps/web`, `apps/mobile`, `apps/extension`).
- Check `JEF-` references in those files for related earlier work.

A plan that names real files and functions is what makes the ticket useful. A
plan built on a guess is worse than none.

### 3. Draft the issue body

```
## Problem / Motivation
<why this matters, in 1-3 sentences>

## Scope
**In scope:**
- ...

**Out of scope:**
- ...

## Implementation Plan
1. <concrete step, naming the actual file/module/use case touched>
2. ...

## Acceptance Criteria
- [ ] ...
- [ ] Tests ship in the same PR (use case, resolver, repository, component or utility, per the repo's conventions)

## Open Questions
- **<question>** — *Recommendation:* <the option you'd pick and a one-line reason>. *Alternative:* <runner-up, if there is a real one>.
```

- Title: short and action-oriented ("Add dark mode toggle to settings page",
  not "Dark mode").
- Keep the plan concrete and sequenced: steps someone could pick up and run.
- Only include "Open Questions" when there are real ones.
- Never leave an open question bare. Each carries a recommendation grounded in
  what you found in step 2 (existing patterns, `CLAUDE.md` conventions, similar
  code). Name the runner-up when the choice is close. If you can settle it by
  reading the code, decide it and state the decision in the plan instead.
- Repeat the recommendations in your reply, one line each, so the user can
  confirm or override them before work starts.

### 4. Create the issue

Call `save_issue` with the title, description and all the defaults above
(team, project, assignee, labels). Check the result: confirm the project,
assignee and labels actually landed, then give the user the identifier (for
example `JEF-512`), the URL, and the project, assignee and labels you set.

### 5. Hand back the rename command

Claude Code cannot run `/rename` itself; it is a user-typed command. So:

- Build a slug: `<issue-identifier>-<kebab-case-title>`, lowercase, hyphens,
  roughly 40-50 characters.
- End the reply with the command on its own line, ready to paste:

  `/rename JEF-512-add-dark-mode-toggle`

Make it the clear final line, not buried in a long message.

## Notes

- Never fabricate a team, project, label or user. Check with the `list_*` tools.
- If the Linear connector is not available, tell the user and stop.
- One issue per idea. If the request is really several pieces of work, say so
  and propose splitting before creating anything.
