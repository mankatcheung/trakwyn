# apps/api/src/use-cases/mockInterviewQuestions - subsystem notes

Loaded when working under `apps/api/src/use-cases/mockInterviewQuestions`. The rest of the API notes are in `apps/api/CLAUDE.md` and the layer map is in the root `CLAUDE.md`. Paths below are relative to `apps/api/src/` unless stated.

## Practice questions tailored to the candidate

The JEF-393 generators can draw on the user's own background, and a third action writes talking points.

- **Opt-in, because it goes to the user's own AI provider.** `GenerateMockQuestionsUseCase` and `GenerateMockAnswerUseCase` take `useProfile` (default `false`) and an optional `documentId`; `buildCandidateBackground` (`use-cases/mockInterviewQuestions/`) loads the profile through `loadUserProfile`/`formatUserProfile` and the document through `ExtractDocumentTextUseCase`, whose ownership check is the only one (a foreign id is `FORBIDDEN`/`NOT_FOUND` before the model is called). Each is capped (`AI_PROMPT_INPUT.MOCK_INTERVIEW_PROFILE_MAX_CHARS`, `..._RESUME_MAX_CHARS`) and fenced with `wrapUntrustedContent`. Both outputs report `usedProfile`/`usedDocument` so a client can say when the background was empty.
- **Talking points are saved on the question** (`MockInterviewQuestion.talkingPoints` plus `talkingPointsGeneratedAt`, stamped by the repository on write, cleared by `null`). `GenerateTalkingPointsUseCase` uses the profile by default, calls no model when there is no background, and asks for `{point, source}` pairs. **A point with no cited source is dropped,** and an empty result is `nothingRelevant: true` with nothing saved. The saved text is one `- point (source)` line each.
- **Chat and MCP:** `generate_mock_talking_points` is a `read` tool like the other generators because chat and MCP call it with `save: false`: it returns the points and writes nothing (a read-scoped token must not write), and only the GraphQL mutation saves. The other two take `useProfile`, default false; talking points default true. Their descriptions say the data goes to the user's own provider.
- The fake LLM route answers the talking points prompt (`MOCK_INTERVIEW_PROMPT_TASK.TALKING_POINTS`) with cited points, so e2e needs no key.
