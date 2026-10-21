**Clipper health** (JEF-417, managed in `infra/posthog`)

- **Clipper event:** `$lib` is `trakwyn-extension`. Web, the web server and mobile send to the same project.
- **What is counted:** fault reports, never users or clips. The Clipper sends no product events, so these are counts, not rates.
- **Release:** the extension's manifest version. A store update takes days to reach everyone, so more than one release is live at a time.
- **Parser result:** a known job board's page gave the parsers less than a clip needs. One board rising means that site changed its markup: reproduce it in `src/lib/parsers/__fixtures__`, then follow the hotfix path in `apps/extension/CLAUDE.md`.
- **Alert:** one per board, on the previous complete day's count.
