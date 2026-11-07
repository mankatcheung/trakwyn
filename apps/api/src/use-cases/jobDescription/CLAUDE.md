# apps/api/src/use-cases/jobDescription - subsystem notes

Loaded when working under `apps/api/src/use-cases/jobDescription`. The rest of the API notes are in `apps/api/CLAUDE.md` and the layer map is in the root `CLAUDE.md`. Paths below are relative to `apps/api/src/` unless stated.

## Cheaper AI calls

The cheapest call is the one not made. Three savers sit in front of the model; the prompt-order audit and `maxTokens` trimming from the ticket are not done (they need `cacheReadTokens` and p95 output from the production dashboard).

- **JSON-LD first.** `FetchJobPostingSourceResolver.resolveDetailed` returns the page text, `fetchedFromUrl` and `structured` (the first `schema.org/JobPosting` in the page, `infrastructure/jobDescription/jsonLdJobPosting.ts`, the server twin of the Clipper's `parseGeneric`). `ParseJobDescriptionUseCase` returns `structured` as the result when it has a title, a company and a description of at least `JOB_POSTING_STRUCTURED.MIN_DESCRIPTION_CHARS` (200): no model call. A partial one goes to the model as "fields the page already states". The key check still runs first, so a user with no key gets `AI_NOT_CONFIGURED` even for such a page.
- **Cross-user cache, fetched pages only.** `IParsedPostingCache` (`CachedParsedPostingStore` over `ICache`, so Redis in production) keys on `sha256` of the whitespace-normalised page text plus `PARSED_POSTING_CACHE.VERSION`, for seven days. **Bump `VERSION` when the parse prompt or its output shape changes.** Pasted text has `fetchedFromUrl: false` and never reaches the cache, because it can hold the user's own notes. It also single-flights, so two simultaneous first parses make one call.
- **Match reuse.** `ResumeMatch.jobDescriptionHash` (`hashJobDescription`, whitespace-collapsed) sits beside `resumeTextHash`. `ComputeResumeMatchScoreUseCase` returns the saved row with no model call and no write when both hashes are unchanged. A row saved before the column existed has `null` and is rescored once. `isStale` is still only about the resume text.
