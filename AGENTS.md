# AGENTS.md

This repo's conventions live in `CLAUDE.md` files, not here. They apply to every coding agent, not only Claude. This file only tells you where to look.

1. Read `CLAUDE.md` at the repo root first.
2. Before changing a file, read every `CLAUDE.md` between the repo root and that file's directory, nearest last. The app-level ones are `apps/api/CLAUDE.md`, `apps/web/CLAUDE.md`, `apps/mobile/CLAUDE.md` and `apps/extension/CLAUDE.md`. `apps/api/CLAUDE.md` indexes the nested files next to the code they describe.
3. Where two files conflict, the nearer `CLAUDE.md` wins.
4. Some instructions name Claude Code features: skills under `.claude/skills/`, `/rename`, worktree tools. They describe the workflow. Follow the intent with your own tools.
