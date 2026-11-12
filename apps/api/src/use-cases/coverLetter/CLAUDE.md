# use-cases/coverLetter - subsystem notes

Loaded when working under `apps/api/src/use-cases/coverLetter`. Paths are relative to `apps/api/src/`.

## The grounding guard (JEF-558)

A letter is sent to an employer, so a name, number or link the user never gave is harmful, not a worse draft. `GenerateCoverLetterUseCase` runs `assertCoverLetterGrounded` on the reply and throws `AiResponseInvalidError` ("The AI produced a letter containing details you have not recorded (…) — nothing was saved. Please try again."), the counterpart of `assertGrounded` in `GenerateResumeUseCase`. It **refuses**, it does not strip the sentence: a trimmed letter would look fine with no sign anything went wrong. A prompt rule (JEF-552) lowers how often this happens; only the check promises it.

- **What it flags:**
  - an employer or school after a history cue (`at`, `joined`, `previously at`, `graduated from`, …), or ending in University/College/Institute or Inc/Ltd/GmbH. `with` and `for` are not cues, because a capitalised word after them is usually a technology ("with Kubernetes");
  - a credential (PhD, MBA, bachelor's, master's, diploma, certified, …) whose spelling group is not in the sources;
  - a number, digits or spelled out (`two` to `million`, `twenty-five`); `one` alone is ignored;
  - a URL, bare domain or email address (`linksIn`).
- **Sources** are the application's company, role and location, the profile, the selected resume, the notes and briefing, the cross-application context, the user's own AI prompt and the instructions. The error names the first three findings (cut to 40 characters), which is also what the eval report shows.
- **The posting is not a source**, because a planted instruction lives there. Its one use: a plain number from it ("a front desk of ten") is allowed unless the letter writes it as a percentage or as years.
- **Durations** worked out from the profile dates ("four years" for Feb 2019 to May 2023) are allowed: `profileDurations.ts` gives, per job and course, for all jobs added up and for the first-to-last span, the rounded-down (a week of slack) and rounded year counts.
- **Known misses,** by design: a name planted in a note (notes are the user's text), soft embellishment ("thrives in fast-paced teams"), and a skill or duty the profile does not list. Those stay with the eval judge. A name that follows no cue ("Google was where I learned…") is also missed; widen only if the corpus shows it.
- **Text comparison** is `normaliseText` and `linksIn` in `use-cases/shared/groundingText.ts`, shared with the eval matchers (`evals/cases/matchers.ts` re-exports them); a use case must not import from `evals/`.
- **Eval:** a refusal is a `reply was not valid` failure before the judge is asked (`runCase`), covered in `generationCases.test.ts`.
