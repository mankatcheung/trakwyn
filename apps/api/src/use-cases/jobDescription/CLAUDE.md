# apps/api/src/use-cases/jobDescription - subsystem notes

Loaded when working under `apps/api/src/use-cases/jobDescription`. The rest of the API notes are in `apps/api/CLAUDE.md` and the layer map is in the root `CLAUDE.md`. Paths below are relative to `apps/api/src/` unless stated.

## Cheaper AI calls

The cheapest call is the one not made. Three savers sit in front of the model; the prompt-order audit and `maxTokens` trimming from the ticket are not done (they need `cacheReadTokens` and p95 output from the production dashboard).

- **JSON-LD first.** `FetchJobPostingSourceResolver.resolveDetailed` returns the page text, `fetchedFromUrl` and `structured` (the first `schema.org/JobPosting` in the page, `infrastructure/jobDescription/jsonLdJobPosting.ts`, the server twin of the Clipper's `parseGeneric`). `ParseJobDescriptionUseCase` returns `structured` as the result when it has a title, a company and a description of at least `JOB_POSTING_STRUCTURED.MIN_DESCRIPTION_CHARS` (200): no model call. A partial one goes to the model as "fields the page already states". The key check still runs first, so a user with no key gets `AI_NOT_CONFIGURED` even for such a page.
- **Cross-user cache, fetched pages only.** `IParsedPostingCache` (`CachedParsedPostingStore` over `ICache`, so Redis in production) keys on `sha256` of the whitespace-normalised page text plus `PARSED_POSTING_CACHE.VERSION`, for seven days. **Bump `VERSION` when the parse prompt or its output shape changes.** Pasted text has `fetchedFromUrl: false` and never reaches the cache, because it can hold the user's own notes. It also single-flights, so two simultaneous first parses make one call.
- **Match reuse.** `ResumeMatch.jobDescriptionHash` (`hashJobDescription`, whitespace-collapsed) sits beside `resumeTextHash`. `ComputeResumeMatchScoreUseCase` returns the saved row with no model call and no write when both hashes are unchanged. A row saved before the column existed has `null` and is rescored once. `isStale` is still only about the resume text.

## The full posting (JEF-591)

`JobApplication.description` is a short summary: the model is asked for two or three sentences, and the JSON-LD and Clipper paths keep the first 2,000 characters. A resume tailored to that misses the keywords an employer screens for, so the posting itself is kept in `JobApplication.postingText`.

- **Where it comes from.** `ParseJobDescriptionUseCase` returns `postingText` beside the parsed fields: the page's JSON-LD description in full (`extractJobPostingDescription`, carried as `ResolvedJobPosting.structuredDescription`) when the page has one, else the text that was read (the pasted text, or the fetched page). It is added after the parse, so it is never in the model's reply and never in the cross-user cache, and `PARSED_POSTING_CACHE.VERSION` did not change. The web forms and the Clipper send it back on create and update; the Clipper's parsers also fill it from the board's own description element.
- **The limit is `FIELD_LENGTH_LIMITS.POSTING_TEXT`** (15,000). The parse result is cut to it, and create and update refuse a longer value rather than cutting (JEF-339). `null` on update clears it; leaving it out keeps it.
- **Readers call `postingForPrompt(app)`** (`use-cases/shared/`), which returns the longer of `postingText` and `description`: the resume, the match score and the cover letter, each cut to its own `AI_PROMPT_INPUT` limit (6,000). The longer one, not always `postingText`, because mobile can only edit the description and older applications had the whole posting pasted there. The match score hashes the text it sent, so capturing a posting rescores once.
- **Not read elsewhere.** Mock interviews, the company briefing, chat and MCP still see `description` only; chat and MCP results are shaped for size (`chatToolProjection`), and a 15,000-character field would defeat that. Search (`ilike` on `description`) does not look at it either.
- It is in the data export and accepted by the import; an imported value over the limit is dropped, not the application.
