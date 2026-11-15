# apps/api/src/use-cases/prompts - subsystem notes

Loaded when working under `apps/api/src/use-cases/prompts`. The rest of the API notes are in `apps/api/CLAUDE.md` and the layer map is in the root `CLAUDE.md`. Paths below are relative to `apps/api/src/` unless stated.

## AI prompts

Every prompt Trakwyn sends a model is a typed module in `use-cases/prompts/`, not a string inside a use case, so the wording can be read, compared and tested in one place.

- **Shape.** A prompt is a `PromptDefinition<Input>` (`prompts/types.ts`): `id` (the feature's `AI_FEATURE`, so a prompt and its usage tag cannot disagree), `version` (a whole number a person bumps) and a pure `build(input)` returning `LLMMessage[]`. There is no registry, no templating engine and nothing in the container: a use case imports the prompt it uses and calls `build`. Inputs are already-formatted blocks (`formatUserProfile`, `buildMockInterviewContext`, `buildCandidateBackground`), which stay where they are because other code shares them.
- **The response schema lives beside the prompt** (`resumeMatchResponseSchema`, `parsedCvResponseSchema`, …) so wording and the contract it promises change in one diff. What happens to the parsed reply (clamping, normalising, grounding checks) stays in the use case.
- **Shared wording is in `prompts/shared.ts`**: `RETURN_ONLY_VALID_JSON` (the output rule three prompts end on) and `promptMessages` (system text, the user's `customAiPrompt` as a second system message, then the request). The custom prompt is the user's data, so it is not part of the version. Third-party text is fenced with `wrapUntrustedContent` in the prompt that carries it; chat states the rule once in `CHAT_SYSTEM_PROMPT` and fences each tool result in `chatAssembly`.
- **Changing a prompt means bumping its `version`.** `__tests__/architecture/promptVersions.test.ts` renders every prompt from a fixed input and pins a hash per `id@version`. Reworded without a bump fails; a new version, a new prompt or a removed one fails until `RECORDED` is updated. The message says which line to add. The per-use-case snapshots (`*PromptMessages.test.ts`) pin the exact messages sent, so a wording change also shows up in review as a snapshot diff.
- **Chat is cache-sensitive.** Anthropic caches the tools + system prefix, so a changed character in `CHAT_SYSTEM_PROMPT` is a cache miss on every conversation. The cache breakpoints are set inside `chatPrompt.build`; `buildChatMessages` is a thin wrapper kept as the call site. The wording of the notes saved when a proposal is confirmed, dismissed or fails is `chatActionNote`, in the same module.
- **The version is recorded.** A call says `{ feature: AI_FEATURE.X, promptVersion: xPrompt.version }` when it resolves a provider (`aiFeatureTag.test.ts` requires it on every call but the key test). It reaches `LlmUsageEvent.promptVersion` (nullable; rows from before JEF-505 are null) and the `app.llm.prompt_version` attribute on the LLM span. It is deliberately not a metric dimension: add it to `trakwyn.llm.cost_micros` only when a dashboard needs cost per version, since it grows the series count.
- **Evals** print each case's `id@version` and a "Prompts" column in the report (`evals/promptRef.ts`), so two runs on either side of a wording change can be told apart. A new `EvalFeature` must say which prompt it exercises.
- **Two caches key on the wording.** Bump `PARSED_POSTING_CACHE.VERSION` (JEF-450) in the same change as `parseJobDescriptionPrompt.version`.
- **A new AI feature** adds its `AI_FEATURE` entry, a prompt module, its `RECORDED` line and a `*PromptMessages` snapshot test, and passes `promptVersion` where it resolves a provider.

## Reading AI feedback (JEF-547)

A thumbs up/down on an assistant reply (web and mobile) or on a generated resume or cover letter (web) says which feature, model and prompt version to write eval cases for. It is stored without any text.

- **What is stored.** `AiFeedback` (one row per user per target; `targetId` is not a foreign key, so trimming a message keeps the signal) holds `feature`, `rating` (`up`/`down`), an optional `reason` from `AI_FEEDBACK_REASON` (no free text, on purpose) and the generation's `provider`, `model`, `promptVersion`, `source` and `tier`. Those come from `Message.ai*` and `DocumentDraft.ai*`, snapshotted when the output is written: `UsageTrackingLLMProvider` stamps `answeredBy` on each completion, so after a failover it names the leg that answered. A draft's snapshot is written at generate time (`GenerateIntoDocumentDraftUseCase`) because the editor saves the text later; generating again overwrites it and clears the user's rating of the old one, so a rating is never filed under a model and prompt that did not write the text. A key that names no model records the provider's default.
- **Trace link (JEF-569).** The snapshot also holds `traceId`, the id of the PostHog `$ai_generation` for the call (`LLMAnsweredBy.traceId`, JEF-567): `Message.aiTraceId`, `DocumentDraft.aiTraceId` and `AiFeedback.traceId`, all nullable (output from before it, and calls with no analytics decorator, keep `null`). The observer sends it as `$ai_trace_id`, so a rating sits on the trace that produced the output.
- **Emitted.** `RateAiOutputUseCase` calls `IAiFeedbackObserver` (`infrastructure/observability/AiFeedbackObserver.ts`), which logs `ai.feedback.rated` at `info` with `feature`, `rating`, `reason`, `provider`, `model`, `prompt_version`, `source` and `tier` (null where absent). That line is the audit trail in the API's own logs. The `trakwyn.ai.feedback` counter and its Axiom dashboard were removed in JEF-571; charts of ratings belong to PostHog (`docs/observability.md`).
- **Down-votes by feature, model and prompt version.** For an ad-hoc query on the logs dataset (`AXIOM_LOGS_DATASET`) the fields are `attributes.*`:

  ```
  ['<logs dataset>']
  | where ['attributes.event'] == "ai.feedback.rated" and ['attributes.rating'] == "down"
  | summarize downs = count() by ['attributes.feature'], ['attributes.model'], ['attributes.prompt_version'], ['attributes.reason']
  | order by downs desc
  ```

  The counter in the metrics dataset answers the same question. Look monthly, find the feature and prompt version with the most down-votes, then write a new eval case by hand: fixtures must stay invented, so a rating never becomes a case automatically.

- **Up-votes alone say little.** Compare against `trakwyn.llm.calls` for the same feature to get a rate.

## Judging resume quality, and the reasoning comparison (JEF-599)

The invented-content eval says a resume is true; it cannot say whether a prompt change makes one better. `evals/judge/resumeQuality.ts` scores generated resumes from 1 to 5 on coverage of the posting's must-haves, use of its terms, bullet specificity and a summary aimed at the role, and every resume eval case reports those numbers (see `evals/CLAUDE.md` and the README). Compare two prompt versions by running the resume cases on the same model, with `--cache` and a `--label` for each, and reading the "Resume quality" columns; the version is in the report's Prompts column. Quality is the offline counterpart of the interview rate below: the eval says which prompt reads better to a judge, the interview rate says which one employers answered.

**Reasoning off versus low for resumes has not been measured yet.** `AI_REASONING_DEFAULTS.RESUME` is still `'off'`. The comparison needs paid runs on a real model and judge, which are run by hand: use `EVAL_REASONING=off` and `EVAL_REASONING=low` with the commands in the README. Change the default only if `low` scores higher on the quality means **and** does not truncate (reasoning tokens come out of the 2,048-token reply cap, so a `low` run with a lower Schema rate or failed cases is a worse result), and write the numbers here when you do.

## Reading interview outcomes next to the ratings (JEF-598)

A thumbs up or down says whether a person liked a resume when they read it; an interview says whether an employer did. They disagree often enough that each is worth reading alone, and a prompt change should be judged on both.

- **What is sent.** When an application gets its **first interview round** and the resume it went out with was written by Trakwyn's AI, `CreateInterviewRoundUseCase` sends `application_interview_reached` (`PostHogAiAnalytics.interviewReached`) with that draft's `prompt_version`, `$ai_model`, `$ai_provider`, `source` and `tier`. It names no application, draft or document and holds no text, and it is best effort: a failed lookup or send never fails the user's own action. Deleting every round and adding one again sends it again.
- **Which draft.** `pickGeneratedResumeDraft` (`use-cases/documents/generatedResume.ts`): the most recently updated resume draft created on or before the applied date, or the latest one when there is no applied date; it counts only when the AI wrote it (the draft has a generation snapshot). The analytics page's "Generated in Trakwyn" row uses the same function, so the user's number and ours cannot disagree.
- **The insight** is `resume_interview_rate` on the AI features dashboard (`infra/posthog/queries/resume_interview_rate.sql`): interviews per 100 resume generations by prompt version and model. The base is generations, not applications (a resume regenerated three times counts three), so it compares versions and models; it is not a conversion rate. A new version reads 0 until its first interviews arrive, which takes weeks.
- **How to use it with the ratings.** Put `ai_downvote_share` and `resume_interview_rate` side by side for the same prompt version. A version that is down-voted more _and_ reaches fewer interviews is a regression worth an eval case. A version that is down-voted more but reaches as many interviews says the dislike may be about style. Small samples swing both, so read the counts beside the rates, and do not act on a version with only a handful of interviews.
