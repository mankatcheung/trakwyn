# use-cases/resume - subsystem notes

Loaded when working under `apps/api/src/use-cases/resume`. Paths are relative to `apps/api/src/`.

## How the prompt asks for it to read (JEF-596)

`prompts/resume.ts` has two kinds of rule, and they are not equal. The "Absolute rules" are about what may be stated (no invented employer, title, date, skill or achievement) and are enforced again in code, below. The "Writing for a recruiter's first skim" section is style: a summary aimed at the role, action-led bullets that keep the source's numbers, the best match first, more room for recent roles, skills ordered by the posting, about one page. A style rule is never allowed to relax an absolute one, and `resumePromptRules.test.ts` pins each absolute rule by its wording so a rewrite of the style guidance cannot drop one unnoticed.

- **A renamed skill must be a known alias.** The prompt tells the model to use the posting's name for a skill the candidate has under another spelling ("PostgreSQL" for "Postgres"). `applyProfileFacts` then keeps a skill only if the profile has it, so a rename outside `SKILL_ALIASES` is dropped, not shown. That is the safe failure, but a posting term you want accepted needs an alias (and a test).
- **The output budget did not move.** The reply is still capped at `LLM.MAX_OUTPUT_TOKENS_CAP` (2,048 tokens, shared by every feature). The new rules ask for fewer bullets in old roles and about a page overall, so replies should be shorter than before, not longer, but that has not been measured on a long profile with a real model. If a long history truncates ("the AI ran out of room"), raising the cap is a cost decision for every AI feature, not part of the prompt.

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

## Asking the user instead (JEF-594)

The model may not invent a skill or a number, so a resume can only be as strong as the profile behind it. `GetResumeGapsUseCase` works out what to ask, in code, with no model call and no cost (`resumeGaps.ts`):

- **Requirement gaps:** the saved posting keywords (`PostingRequirements.keywords`, JEF-593) the profile neither lists nor mentions, tested with `profileSkillMatcher`, the same matcher `applyProfileFacts` uses. "The resume may say it" and "we need not ask about it" are therefore one test: a skill the user adds is immediately kept by the next resume, and one they never added is still dropped. Up to `RESUME_GAPS.MAX_REQUIREMENTS`, in the posting's order.
- **Roles without numbers:** roles whose description holds no digit, most recent first, up to `RESUME_GAPS.MAX_ROLES`. A digit is a crude test for "has a figure" and deliberately so: it is cheap, explainable, and a role that gets a number stops being asked about.
- **`requirementsRead: false`** says the posting has not been read, so the client can point to the Overview instead of showing nothing. The list is not refused for a stale reading: a slightly old keyword is still a useful question.
- **Answers use the existing writes.** The web panel saves a "yes" with `createSkill` or `updateWorkExperience` (the answer appended to the description as a bullet); there is no new write path and nothing is written into a draft, so the user generates again once the profile is fuller.
- **A "no" is remembered per application** (`ResumeGapDismissal`, one row per `(applicationId, key)`, cascades with the application). The key is the requirement lower-cased and trimmed, or `role:<workExperienceId>`. It is per application on purpose: not having used Kubernetes is true everywhere, but the question only exists for a posting that asks for it, and a profile that later gains the skill answers it anyway. `DismissResumeGapUseCase` bounds the table (`KEY_MAX_CHARS`, `MAX_DISMISSED_PER_APPLICATION`), since the key is free text from the client.
- Web reports `resume_gap_answered {kind, answer}` (string enums only; no keyword or text leaves the device).

## Certifications and languages (JEF-592)

The profile also holds `Certification` (name, issuer, issued and expiry dates, credential link) and `Language` (name, level), each its own table and CRUD like skills. They are part of `UserProfile` (`loadUserProfile`, `formatUserProfile`, `isUserProfileEmpty`), so a profile with only these is not empty.

- **The model only chooses which to list.** `assertGrounded` refuses a certification or language the profile does not hold (same refusal as an invented employer); `applyProfileFacts` then rewrites each listed entry's name, issuer, date and level from the profile and drops repeats. A certification's date is its issue month; an expiry date is in the prompt text but not on the resume.
- **Both arrays are optional in the reply** (`resumeResponseSchema`), so an older or shorter reply is still valid. `resumeToTiptapDoc` renders Certifications and Languages after Skills.
- **Not yet:** CV import, mobile editing, chat and MCP tools do not read or write these sections; Projects and Awards come in a follow-up under the same ticket.
