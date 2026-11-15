# use-cases/resume - subsystem notes

Loaded when working under `apps/api/src/use-cases/resume`. Paths are relative to `apps/api/src/`.

## What the model may and may not decide

A resume is sent to an employer, so the facts the profile already holds are not left to the model. `GenerateResumeUseCase` runs two checks on the parsed reply, both in `resumeGrounding.ts`:

- **`assertGrounded` refuses.** An employer or a school the user never entered throws `AiResponseInvalidError` and nothing is saved. It does not strip the entry: a trimmed resume would look fine with no sign anything went wrong. The eval reports this as "reply was not valid", before the judge is asked.
- **`applyProfileFacts` corrects (JEF-597).** Where the right value is known, the reply is overwritten with it instead of refused, because the employer is real and the corrected resume is the one the user wanted:
  - **Periods** are written from the stored dates (`Mar 2021 – Present`, `formatProfileMonth`), for roles and courses. The prompt still asks the model for a period; whatever it writes is replaced.
  - **Titles** become the stored title for that employer, in the user's spelling. `titleKey` treats case, punctuation and common abbreviations (`Sr`, `Eng`, `Mgr`) as the same title, so those are not counted as corrections.
  - **Skills** stay only if the profile lists them or one of its role or course descriptions names them (whole words, after `skillKey`: aliases such as Postgres/PostgreSQL and JS/JavaScript, a level in brackets removed, `+` and `#` kept so C is not C++). A skill only the posting asks for is dropped, and a group left empty goes with it.
  - **Two stints at one employer** each get their own row: the row whose title matches, else the first one not yet used.
- **Not checked here:** the bullet text and the summary. They are the model's wording of the descriptions; invented content there is the eval judge's job (`evals/judge/claimCheck.ts`).
- **Logged, never stored.** When a title was changed or a skill dropped, the use case logs `resume.grounding.corrected` at `info` with counts and the prompt version (no text). A period rewrite alone logs nothing, since the model's date format almost always differs. A rise in `titles` or `skills_dropped` after a prompt or model change is the signal to look at.
- A new alias or abbreviation goes in `SKILL_ALIASES` or `TITLE_ABBREVIATIONS` with a test; keep both short, since a wrong alias lets a skill through.
