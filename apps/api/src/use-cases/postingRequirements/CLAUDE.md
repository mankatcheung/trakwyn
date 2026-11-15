# use-cases/postingRequirements - subsystem notes

Loaded when working under `apps/api/src/use-cases/postingRequirements`. Paths are relative to `apps/api/src/`.

## What a posting asks for (JEF-593)

A resume used to be tailored to the posting as one block of text, so which requirements it addressed was up to the model each time. `PostingRequirements` is the posting read once into must-haves, nice-to-haves, the keywords a screener searches for and the seniority it names, kept one row per application (`infrastructure/db/schema/postingRequirements.ts`, cascades with the application).

- **One model call per version of a posting.** `ExtractPostingRequirementsUseCase` returns the saved row with no call, no rate-limit attempt and nothing charged while `postingHash` and `promptVersion` are unchanged (`isCurrent`), the same reuse the match score has (JEF-450). The hash is of the text that is sent: `postingForPrompt(app)` cut to `AI_PROMPT_INPUT.POSTING_REQUIREMENTS_MAX_CHARS`. Bumping `postingRequirementsPrompt.version` makes every saved list stale once, which is how a better prompt reaches postings already read.
- **The reply is not trusted.** Lists are trimmed, de-duplicated and cut to `POSTING_REQUIREMENTS` (`MAX_ITEMS`, `MAX_KEYWORDS`, `ITEM_MAX_CHARS`), because they go into every resume prompt for the application. A posting that states nothing saves empty lists, so it is not read again on every resume. The posting is fenced with `wrapUntrustedContent`, and the prompt says to ignore instructions inside it.
- **Reading a page never calls a model.** `GetPostingRequirementsUseCase` (`postingRequirements` query) returns the saved row or `null`, with `isStale` when the posting was edited since. Only the `extractPostingRequirements` mutation and resume generation call the model.
- **Resume generation uses it, but never depends on it.** `GenerateResumeUseCase.requirementsFor` calls the extract use case (an optional dependency, absent in the eval harness) and passes the lists to `resumePrompt` as a fenced "What the posting asks for" block. Any failure (no posting, rate limit, spent credits, a bad reply) leaves the resume to be written from the posting text alone; all but "no posting" log `resume.requirements.unavailable` at `warn`. The prompt tells the model to cover each requirement the background supports in the posting's own terms and to leave out the rest; `applyProfileFacts` (JEF-597) still drops a skill the profile does not have.
- **Credits.** `AI_CREDITS.WEIGHTS.postingRequirements` is 1, charged only when a model is actually called. So the first hosted resume for a posting costs the resume's 3 plus 1, and later ones 3; the resume button's printed cost does not include the 1.
- **Rate limit** is `RATE_LIMIT.EXTRACT_POSTING_REQUIREMENTS`, counted only on a real call.
- The fake LLM route answers the prompt (`POSTING_REQUIREMENTS_PROMPT_TASK`) with a canned list, so dev and e2e need no key.
- **Not done here:** the match score does not read the list yet, chat and MCP do not expose it, and there is no mobile screen. Asking the user about requirements the profile does not cover is JEF-594.
