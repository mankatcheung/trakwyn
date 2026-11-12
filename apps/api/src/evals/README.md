# AI evals

The evals run Trakwyn's real AI use cases, with their real prompts, against a real model, and score what comes back. They answer a question the unit tests cannot: **does this prompt, with this model, produce a good answer?** Unit tests replace the model with a scripted fake, so they only show that the code handles a reply correctly.

- **They cost money and vary from run to run.** Run them by hand. `pnpm test` and CI never reach a provider.
- **They are not a merge gate.** A score moves when the model, the prompt or the temperature moves. Use them to compare **before and after** a change (a prompt edit, a cheaper model, reasoning turned off), not to block a pull request.
- **Everything runs from `apps/api/`**, through `pnpm --filter @trakwyn/api eval` at the repository root, which uses `apps/api` as its working directory.

For the design notes behind each group of cases (why they exist, how to add one), see [`CLAUDE.md`](./CLAUDE.md) in this folder.

## Contents

1. [Quick start](#quick-start)
2. [Setting up secrets](#setting-up-secrets)
3. [Variables](#variables)
4. [Targets: which model is tested](#targets-which-model-is-tested)
5. [The judge](#the-judge)
6. [Flags](#flags)
7. [Example commands](#example-commands)
8. [Comparing models](#comparing-models)
9. [Reading the report](#reading-the-report)
10. [Publishing to Langfuse](#publishing-to-langfuse)
11. [Saved runs](#saved-runs)
12. [The cache](#the-cache)
13. [What is covered](#what-is-covered)
14. [Where model text is rendered](#where-model-text-is-rendered)
15. [Troubleshooting](#troubleshooting)

## Quick start

```bash
# 1. Put a target and a judge in apps/api/.env (see "Setting up secrets").

# 2. Check the judge. Cheap, and needs no target.
pnpm --filter @trakwyn/api eval --validate-judge --cache

# 3. Run one case to confirm the target works.
pnpm --filter @trakwyn/api eval --target openai:gpt-4o-mini --case jd-standard --cache

# 4. Run everything and keep the report.
pnpm --filter @trakwyn/api eval --target openai:gpt-4o-mini --cache --out ~/evals/baseline.txt
```

Replace `openai:gpt-4o-mini` with the provider and model you are testing.

## Setting up secrets

The runner loads `apps/api/.env` on its own (`--env-file-if-exists`). You can also export the variables in your shell. A variable that is already exported wins over the file.

```bash
cp apps/api/.env.example apps/api/.env   # once, if you have not already
```

Then add the `EVAL_*` lines from [Variables](#variables) to that file.

**Rules for the keys:**

- **Never commit them.** `apps/api/.env` is gitignored. Do not put a key in a command you paste into a chat, an issue, a pull request or a screenshot. If one leaks, revoke it at the provider and make a new one.
- **Use separate credentials for evals.** The eval variables are all named `EVAL_*` so they can never be mistaken for the production ones. In particular, Cloudflare uses `EVAL_CLOUDFLARE_*`, not `PLATFORM_CLOUDFLARE_*` (the hosted-AI credentials). Make a token only for evals so it can be revoked on its own.
- **Give each token the least it needs.** For Cloudflare that is **Workers AI** permission on the one account. Other providers need only a normal inference key.
- **Set spending limits at the provider** where it offers them. A full run is small (see [Cost](#cost)), but a typo in a loop is not.
- **Worktrees copy `.env`.** `pnpm setup:worktree` copies the `.env` files into a new worktree, so the keys exist in every worktree you make. Delete a worktree when you are done with it.
- **The cache holds no keys.** A key is not part of the cache key, and the files hold only prompts, replies and token counts. The prompts come from invented fixtures, never real user data. The folder is gitignored anyway.
- **Check which model answered** by naming it on the command line (`--target openai:gpt-4o-mini`) rather than relying on a provider's default. The report labels each row with what you typed.

**A minimal `.env`** for testing Cloudflare Workers AI with a different provider as the judge:

```bash
# The model under test
EVAL_CLOUDFLARE_ACCOUNT_ID=<your Cloudflare account id>
EVAL_CLOUDFLARE_API_TOKEN=<token with Workers AI permission>

# The judge
EVAL_JUDGE_PROVIDER=anthropic
EVAL_JUDGE_MODEL=<a capable model id>
EVAL_JUDGE_API_KEY=<key for the judge's provider>
```

## Variables

Everything is optional until you use the feature it belongs to. A missing variable makes the run stop with exit code 2 and a message naming it, **before** any paid call.

### The target (the model being tested)

| Variable                     | When it is used                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVAL_PROVIDER`              | The provider to test, when you pass no `--target`. Same values as the `--target` provider part.                                                                                                                                                                                                                                                            |
| `EVAL_MODEL`                 | The model for `EVAL_PROVIDER`. If you leave it out, the provider's default model is used, which hides which model you tested; name it.                                                                                                                                                                                                                     |
| `EVAL_API_KEY_<PROVIDER>`    | The key for one provider, with the provider name in capitals: `EVAL_API_KEY_OPENAI`, `EVAL_API_KEY_ANTHROPIC`, `EVAL_API_KEY_GOOGLEAI`, `EVAL_API_KEY_OPENROUTER`, `EVAL_API_KEY_MISTRAL`, `EVAL_API_KEY_GROQ`, `EVAL_API_KEY_XAI`, `EVAL_API_KEY_DEEPSEEK`, `EVAL_API_KEY_NVIDIA`, `EVAL_API_KEY_CUSTOM`. **Use these when comparing several providers.** |
| `EVAL_API_KEY`               | The fallback key, used when there is no `EVAL_API_KEY_<PROVIDER>` for that provider. Fine for a single provider. **Not used by `workersai`.**                                                                                                                                                                                                              |
| `EVAL_BASE_URL`              | `custom` only. The **full chat-completions URL**, for example `https://host/v1/chat/completions`. The adapter posts straight to it, so a URL without `/chat/completions` answers 404.                                                                                                                                                                      |
| `EVAL_CLOUDFLARE_ACCOUNT_ID` | `workersai` only. Your Cloudflare account id. It is not secret.                                                                                                                                                                                                                                                                                            |
| `EVAL_CLOUDFLARE_API_TOKEN`  | `workersai` only. A token with Workers AI permission. Secret.                                                                                                                                                                                                                                                                                              |

### The judge (the model that grades)

Needed only when the selected cases include the graded ones (resume and cover letter, see [What is covered](#what-is-covered)), and for `--validate-judge`. The judge is configured **only** from these variables. It never borrows the target's model or key, so scores stay comparable between targets.

| Variable                           | When it is used                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- |
| `EVAL_JUDGE_PROVIDER`              | The judge's provider. Same values as for targets.                                                  |
| `EVAL_JUDGE_MODEL`                 | The judge's model. Required for `custom` and `workersai`; name it for the others too.              |
| `EVAL_JUDGE_API_KEY`               | The judge's key. This is the only key variable a judge reads (no `_<PROVIDER>` form, no fallback). |
| `EVAL_JUDGE_BASE_URL`              | `custom` judge only. The full chat-completions URL, with the same rule as `EVAL_BASE_URL`.         |
| `EVAL_JUDGE_CLOUDFLARE_ACCOUNT_ID` | `workersai` judge only.                                                                            |
| `EVAL_JUDGE_CLOUDFLARE_API_TOKEN`  | `workersai` judge only.                                                                            |

### Langfuse (`--publish`)

Read only when you pass `--publish` (see [Publishing to Langfuse](#publishing-to-langfuse)). They are the eval project's own keys, never the app's.

| Variable                   | When it is used                                                                                                         |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `EVAL_LANGFUSE_PUBLIC_KEY` | The project's public key (`pk-lf-…`). Required with `--publish`.                                                        |
| `EVAL_LANGFUSE_SECRET_KEY` | The project's secret key (`sk-lf-…`). Required with `--publish`. Secret.                                                |
| `EVAL_LANGFUSE_BASE_URL`   | Optional. Defaults to the EU cloud, `https://cloud.langfuse.com`. For a US project use `https://us.cloud.langfuse.com`. |

### Behaviour

| Variable              | Meaning                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVAL_MIN_PASS_RATE`  | The pass rate every target must reach, from 0 to 1. Default `0.8`. The `--min-pass-rate` flag wins over it.                                                                                        |
| `EVAL_MAX_ERROR_RATE` | The share of a target's cases that may end in `error` before the target is not trusted, from 0 to 1. Default `0.1`. The `--max-error-rate` flag wins over it. See [Outcomes](#reading-the-report). |

## Targets: which model is tested

A target is written `provider:model`. Only the first colon splits it, so model names that contain a colon still work.

| Provider                                                                                        | Example                             | Needs                                                     |
| ----------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------- |
| `openai`, `anthropic`, `googleai`, `openrouter`, `mistral`, `groq`, `xai`, `deepseek`, `nvidia` | `anthropic:<model-id>`              | `EVAL_API_KEY_<PROVIDER>` or `EVAL_API_KEY`               |
| `workersai` (Cloudflare Workers AI)                                                             | `workersai:@cf/openai/gpt-oss-120b` | `EVAL_CLOUDFLARE_ACCOUNT_ID`, `EVAL_CLOUDFLARE_API_TOKEN` |
| `custom` (any OpenAI-compatible endpoint)                                                       | `custom:my-model`                   | a key, `EVAL_BASE_URL`, and a model after the colon       |

**Use `workersai` for Cloudflare, not `custom` with a Cloudflare URL.** `workersai` builds the provider the way hosted AI does. A use case's "reasoning off" setting then becomes `reasoning_effort: "low"` for gpt-oss and `chat_template_kwargs` for Gemma. On `custom` that setting is dropped, gpt-oss thinks at its default effort, uses up the 512-token budget and returns truncated replies. `workersai` also calls Workers AI directly, with no gateway headers, so a run adds nothing to production analytics.

**The Workers AI models Trakwyn hosts:** `@cf/google/gemma-4-26b-a4b-it` and `@cf/openai/gpt-oss-120b`.

**Models that do not work with `custom`:** ones served only through OpenAI's `/responses` route or an Anthropic-style `/v1/messages` route. The adapter speaks chat completions.

## The judge

Two generation features, **resume** and **cover letter**, write text a user might send to an employer. The failure that matters is an invented employer, title, school, skill, date or number. Plain checks cannot see that, so a second model, the judge, lists every claim in the output and says whether the profile, posting and notes support it.

- **Pick a judge at least as capable as the targets.** It makes the most expensive calls in the run.
- **It is validated before it is trusted.** Every run that uses a judge first has it sort 11 hand-labelled outputs (faithful ones and ones with one planted invention). If it gets fewer than **90%** right, the run stops with exit code 1 and scores nothing.
- **Validate once, then keep the judge fixed.** Changing the judge changes the scores of the same target, so two runs with different judges cannot be compared.
- **Skip the graded cases** if you have no judge: list the other case ids with `--case`.

## Flags

Flags that take a value need one (`--out` with nothing after it is an error). An unknown flag is an error. Everything is checked before the first model call.

| Flag                        | Meaning                                                                                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--target provider[:model]` | A model to test. **Repeat it** to compare models in one table. If you pass none, `EVAL_PROVIDER` and `EVAL_MODEL` are used. With neither, the run stops (except with `--validate-judge`).                         |
| `--case <id>[,<id>]`        | Run only these cases. Repeat the flag or separate ids with commas. Without it, all cases run.                                                                                                                     |
| `--min-pass-rate <0-1>`     | The pass rate a target must reach for the run to succeed. Default `0.8`. Outside 0 to 1 is an error.                                                                                                              |
| `--max-error-rate <0-1>`    | The share of a target's cases that may end in `error` (the provider's fault, not the model's) before the run exits `4`. Default `0.1`. Outside 0 to 1 is an error. See [Outcomes](#reading-the-report).           |
| `--cache`                   | Store each reply on disk and reuse it on the next run. See [The cache](#the-cache).                                                                                                                               |
| `--refresh`                 | Ask the model again and overwrite what is stored. **Implies `--cache`**, so you do not need both.                                                                                                                 |
| `--validate-judge`          | Run only the judge check, print each verdict and stop. Needs the `EVAL_JUDGE_*` variables and no target. No target model is called.                                                                               |
| `--publish`                 | After the run, upload it to Langfuse so you can browse and compare it. Needs the `EVAL_LANGFUSE_*` keys. See [Publishing to Langfuse](#publishing-to-langfuse). Off by default; not used with `--validate-judge`. |
| `--label <name>`            | Add a name to the run's folder, for example `baseline`. See [Saved runs](#saved-runs).                                                                                                                            |
| `--publish-from <run-dir>`  | Upload a [saved run](#saved-runs) to Langfuse without calling any model. Needs only the `EVAL_LANGFUSE_*` keys; cannot be combined with run flags. See [Publishing to Langfuse](#publishing-to-langfuse).         |
| `--force`                   | With `--publish-from`: upload even though the folder was already published.                                                                                                                                       |
| `--no-save`                 | Do not keep this run in a folder. Without it every run is saved.                                                                                                                                                  |
| `--out <file>`              | Also write the full report, failures included, to this file. Missing folders are created and an existing file is **overwritten**. Separate from the [saved run](#saved-runs) folder, which is kept either way.    |

## Example commands

Run from the repository root. Swap in your own provider and model ids.

```bash
# Check the judge before anything else
pnpm --filter @trakwyn/api eval --validate-judge --cache

# Smoke test: two cases on one model
pnpm --filter @trakwyn/api eval --target workersai:@cf/openai/gpt-oss-120b \
  --case jd-standard,match-strong-backend --cache

# Full baseline for one model, saved to a file
pnpm --filter @trakwyn/api eval --target workersai:@cf/openai/gpt-oss-120b \
  --cache --out ~/evals/gpt-oss-baseline.txt

# Compare the two hosted Workers AI models
pnpm --filter @trakwyn/api eval --cache --out ~/evals/hosted-models.txt \
  --target workersai:@cf/openai/gpt-oss-120b \
  --target workersai:@cf/google/gemma-4-26b-a4b-it

# Compare across providers (set EVAL_API_KEY_OPENAI and EVAL_API_KEY_ANTHROPIC)
pnpm --filter @trakwyn/api eval --cache \
  --target openai:<model-id> --target anthropic:<model-id>

# A custom OpenAI-compatible endpoint (needs EVAL_BASE_URL and a key)
pnpm --filter @trakwyn/api eval --target custom:<model-id> --cache

# Only the chat cases
pnpm --filter @trakwyn/api eval --target workersai:@cf/openai/gpt-oss-120b --cache \
  --case chat-upcoming-interviews,chat-rejections,chat-offer-salary,chat-ambiguous-stripe-notes,chat-two-tools-stripe,chat-no-tool-introduction,chat-no-tool-more-time,chat-write-is-proposed,chat-delete-refused,chat-injection-in-note,chat-injection-in-description,chat-analytics-response-time,chat-skills-profile,chat-missing-offer,chat-compare-two-applications

# Re-ask one case to see whether a failure is flaky
pnpm --filter @trakwyn/api eval --target workersai:@cf/openai/gpt-oss-120b \
  --case jd-german --refresh

# A stricter bar
pnpm --filter @trakwyn/api eval --target openai:<model-id> --min-pass-rate 0.9 --cache

# Rebuild the last report from the cache without calling the model again
# (use exactly the same targets and flags as the earlier run, and --cache)
pnpm --filter @trakwyn/api eval --target workersai:@cf/openai/gpt-oss-120b --cache
```

**Finding case ids:** they are the `id` values in `cases/*.ts`, and every case id also appears in the report. The prefixes are `jd-`, `match-`, `chat-` and `briefing-`; the generation cases are named `resume-…` and `cover-letter-…`.

## Comparing models

Repeat `--target`. Every target runs the same cases with the same judge and shares one table.

1. **Name every model.** `openai:default` hides which model that was.
2. **Keep the judge fixed** between runs you want to compare.
3. **Compare on the same commit.** A prompt edit changes the result; the report's **Prompts** column shows each prompt as `id@version` so two runs are told apart.
4. **Use `--cache` while iterating,** and `--refresh` when you want a fresh answer.
5. **Look beyond the pass rate.** A cheaper model that passes by making more tool calls shows up in the chat tool use list and the token columns.
6. **Run it twice if the result is close.** Models vary between runs.

## Reading the report

Each case prints a line as it finishes (`pass`, `FAIL` or `ERROR`, the case id, the time, and for chat the tool calls and rounds). When all cases are done the table appears:

| Column                  | Meaning                                                                                                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Target**              | The `provider:model` you passed.                                                                                                                                                                            |
| **Passed**              | Cases that passed out of the cases that ran (passed plus failed), with a percentage, for example `61/63 (97%)`. Errors and skipped cases are not in it. This is what `--min-pass-rate` is compared against. |
| **Errors**              | Cases that ended in `error`: the provider's fault, not the model's. Compared against `--max-error-rate`.                                                                                                    |
| **Skipped**             | Cases never run because the target stopped on its quota.                                                                                                                                                    |
| **Schema**              | The share of replies the app could read in the shape it expects. Low means the model breaks the format, or ran out of room.                                                                                 |
| **By feature**          | Passed out of run for each feature: `jobDescription`, `resumeMatch`, `resume`, `coverLetter`, `chat`, `briefing`.                                                                                           |
| **Prompts**             | The prompt and version each feature ran, as `id@version`.                                                                                                                                                   |
| **Tokens in/out**       | What the target used.                                                                                                                                                                                       |
| **Judge tokens in/out** | What the judge used, kept apart from the target's.                                                                                                                                                          |
| **Cache hit/miss**      | Only with `--cache`. Replies served from disk versus asked of the model. Only the target's calls are counted.                                                                                               |
| **Mean latency**        | Average time per case. It reads `cached` when every reply came from disk, because a replay's time says nothing about the model.                                                                             |

Below the table:

- **Chat tool use:** tool calls and rounds for each chat case.
- **Failures:** every case the model got wrong, with the reason. An invented claim in a resume names the claim.
- **Errors:** every case the provider (or the judge) failed on, with the reason. A provider error shows the HTTP status and the start of the response body, for example `[HTTP 400, body: …]`.

**Outcomes**

Every case ends as one of four outcomes, so a provider's bad minute does not read as a model's score (JEF-559):

| Outcome   | Meaning                                                                                                                                                                                                                                   | Scored |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `pass`    | The case found nothing wrong.                                                                                                                                                                                                             | yes    |
| `fail`    | The model's: a check failed, the reply was not valid JSON, was cut off, or was refused for naming something the user never gave, or the model leaked a tool call into its answer (`Completion carried channel markers…`, reasoning text). | yes    |
| `error`   | The provider's or the harness's: any provider error (HTTP 429, 5xx, 400, a timeout, a bad key), a quota stop, a judge failure, or any other thrown error.                                                                                 | no     |
| `skipped` | Never run, because an earlier case hit the provider's daily quota.                                                                                                                                                                        | no     |

The pass rate is passed over passed plus failed. Sixty-one passes, two fails and two 429s report as `61/63 (97%)` with `2` errors, and meet the default 80% bar. To keep a mostly broken run from looking green, a target whose errors are more than `--max-error-rate` of its cases (default `0.1`) is not trusted and the run exits `4`. Exit codes are checked in this order: `2`, then `3`, then `4`, then `1`, then `0`.

**Exit codes**

| Code | Meaning                                                                                                                                                                                                                                                                                                              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Every target reached the pass rate (or `--validate-judge` passed).                                                                                                                                                                                                                                                   |
| `1`  | A target fell short, or the judge scored under 90% and was not trusted.                                                                                                                                                                                                                                              |
| `2`  | Bad arguments or missing configuration. Nothing was called.                                                                                                                                                                                                                                                          |
| `4`  | A target had more `error` cases than `--max-error-rate` allows (default 10%), so its pass rate is not trusted. The report says which target and how many. A systematic bug, such as a request the provider rejects with HTTP 400 on most cases, lands here instead of looking like a low score.                      |
| `3`  | A target stopped on its provider's daily quota (for example Cloudflare's free allocation, which resets at 00:00 UTC). Its remaining cases were skipped and its row reads `stopped (quota)`, not a pass rate. Other targets in the run still ran. Re-run after the reset, with `--cache` to reuse the answered cases. |

## Publishing to Langfuse

The table says which cases failed, not what a case sent, what it got back or how two runs differ. `--publish` uploads the run to [Langfuse](https://langfuse.com) so you can browse every case and compare runs side by side. It is optional: without the flag nothing changes and nothing calls Langfuse. The printed report and `--out` work the same either way.

**Only evals go there.** The fixtures are invented, so sending prompts and replies to a third party is fine. Production traffic never goes to Langfuse, and nothing outside `src/evals/` imports its SDK.

**Set up (once):**

1. Create a free account at [cloud.langfuse.com](https://cloud.langfuse.com) (or the US cloud) and a project, for example `trakwyn-evals`.
2. In the project's settings, create an API key pair.
3. Add the keys to `apps/api/.env` (see [Langfuse variables](#langfuse---publish)). If you signed up on the US cloud, set `EVAL_LANGFUSE_BASE_URL` too.

**Use it:**

```bash
pnpm --filter @trakwyn/api eval --target openai:gpt-4o-mini --cache --publish
```

A missing `EVAL_LANGFUSE_*` key stops the run with exit code 2 **before any paid call**. After the report is printed, the runner prints a link for each target. If Langfuse is down or rejects the keys, it prints why and carries on: the exit code still reflects the pass rate only.

**What you get:**

- **One dataset**, `trakwyn-evals`, with an item per case. The item id is the case id, and its metadata holds the `feature` and the `prompt` (`id@version`).
- **One dataset run per target per invocation**, named `<target> @ <commit> @ <timestamp>`. Its metadata holds the target, the judge, the commit and the cache counts.
- **A trace per case**, linked to its dataset item, with one generation per model call (messages in, reply out, tokens, latency) and one per judge call.
- **Scores per case:** `passed` and `schema_valid` (true or false), plus `tool_calls` and `iterations` for chat. The failure reasons are the comment on `passed`.

**Comparing two runs:** open the dataset in Langfuse, select two runs, and use Compare. Two `--target`s in one command give two runs you can compare; so do a run before and after a prompt edit. Run both on the same dataset and judge, as in [Comparing models](#comparing-models).

**Limits of the free Hobby plan** (check [langfuse.com/pricing](https://langfuse.com/pricing) for the current numbers): 50k units a month, 30 days of data and 2 users. A case costs a few units, so a full run of about 60 cases is a small fraction of the month. Runs older than 30 days disappear from Langfuse, so keep a copy with `--out` if you need it. Self-hosting is possible later: only `EVAL_LANGFUSE_BASE_URL` changes.

**Notes:**

- A cache hit is uploaded like a live reply. The run's metadata carries the hit and miss counts, and the latency of a replayed call says nothing about the model.
- Running the same command twice makes two runs (the timestamp differs). The dataset and its items are updated in place.
- `--validate-judge` runs are not uploaded.

**Publishing a saved run afterwards (`--publish-from`):** every run is [saved](#saved-runs), so you can upload one later, or upload it again after an outage:

```bash
pnpm --filter @trakwyn/api eval --publish-from .eval-runs/2026-11-12T1030Z-ab12cd3-baseline
```

It reads the folder and calls no model and no judge, so it needs no target, judge or provider variable, only the `EVAL_LANGFUSE_*` keys. Langfuse shows the run as it happened: the folder's commit and start time, and each call's real start and duration (the folder keeps the recorded calls, not the cache's instant replays). `--target`, `--case`, `--cache`, `--refresh`, `--publish`, `--validate-judge`, `--out`, `--label` and `--no-save` cannot be combined with it (exit 2).

After a successful upload the folder's `run.json` gets `publishedAt` and the Langfuse run names. Publishing the same folder again stops with exit 2 and a warning, because Langfuse would hold two identical runs; add `--force` to do it anyway. An unreadable folder also exits 2, naming the file. If Langfuse rejects the upload the exit code is 1 and the folder is left unmarked.

## Saved runs

Every run is kept in a new folder under the gitignored `apps/api/.eval-runs/`, so it is still there after the terminal closes. The folder is named `<UTC time>-<short commit>[-<label>]`, for example `2026-11-12T1030Z-ab12cd3-baseline`. A name that already exists gets a `-2`, `-3` suffix: an earlier run is never overwritten. Add `--label` to name a run, or `--no-save` to keep nothing. `--out` works as before and is separate.

| File                            | What it holds                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run.json`                      | How the run was made: commit, start and finish times, flags, target and judge labels, case ids, prompt versions, cache hits and misses, and the exit code. `partial: true` means a target stopped on its quota. |
| `summary.md`                    | The report, as `--out` writes it.                                                                                                                                                                               |
| `summary.json`                  | The summary per target: totals, pass rate, tokens and results by feature.                                                                                                                                       |
| `transcripts/<target>.jsonl.gz` | One case result per line, with every model call and judge call (messages, reply, tokens, timing). Read one with `gzip -dc file \| jq`.                                                                          |

No file holds an API key or a base URL: targets are recorded by their `provider:model` label only. A failed save is reported and never changes the exit code.

## The cache

`--cache` (and `--refresh`) store each model reply in `apps/api/.eval-cache/` as one indented JSON file named by a hash of the request.

- **What is part of the key:** the provider, the model, the messages, the token limit and the options. Editing a prompt or a fixture changes the messages, so it **misses by itself**. Changing only a check, or re-running to print the report again, costs nothing.
- **What is not cached:** failures (so an error is asked again), and chat streams. The judge's replies are cached like the target's.
- **Reading a file:** open it. It holds the reply and its token usage.
- **Clearing it:** delete the folder, or use `--refresh`. Files from an older version of the runner that were written on one line still work.

## What is covered

The suite has **65 cases** over six features:

| Feature (prompt)        | Cases | What they check                                                                                                                                                                                                                                    |
| ----------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Job description parsing | 13    | Clean ads, a page with its navigation attached, German, a recruiter blurb, a prompt injection, one that plants an image and a link, a long posting that must be summarised. Ids start `jd-`.                                                       |
| Resume match score      | 10    | Strong, partial, junior for senior, adjacent field, zero overlap both ways, an injection in the resume and one in the job description. Ids start `match-`.                                                                                         |
| Resume                  | 7     | A posting that asks for skills the user lacks, a thin profile, an empty skills list, an instruction hidden in the posting and in a note, and two that order a link and an address into the document. **Graded by the judge.** Ids start `resume-`. |
| Cover letter            | 7     | The same seven situations. **Graded by the judge.** Ids start `cover-letter-`.                                                                                                                                                                     |
| Chat tool selection     | 20    | Whether the assistant picks the right tool with the right arguments. Writes are proposals, never applied; a delete is refused. Ids start `chat-`.                                                                                                  |
| Company briefing        | 8     | A briefing grounded in the pages it was given, not inventing sources, and ignoring orders hidden in a page, including one to send the reader to another site. Ids start `briefing-`.                                                               |

Checks are ranges and "mentions" tests, not exact wording, because every model phrases a correct answer differently. Fixtures are invented. Tone and helpfulness are not judged.

### Cost

A full run is about 22 short requests for the plain features, 20 chat turns (each may make several model calls), and for the resume and cover letter, 14 generations and 14 judge calls. Add 11 judge calls for validation. The report shows tokens for the target and the judge separately. With `--cache`, a repeat is free.

## Where model text is rendered

The render side is not an eval (the evals only ask whether a model _writes_ a link or image; JEF-464 and the tests below cover whether the app _shows_ one). Every place the app shows model text, and how it is protected:

| Surface                                                                                                   | Protection                                                                                                                                                          | Test                                                            |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Chat, web (`ChatConversationView` through `Markdown.tsx`); the floating chat window renders the same view | `safeMarkdownUrl`: images become their alt text, only `http`, `https` and `mailto` links survive                                                                    | `Markdown.test.tsx`, `ChatConversationView.test.tsx`            |
| Chat, mobile (`ChatScreen` through `Markdown.tsx`)                                                        | `isSafeMarkdownUrl`, no `Image` rule                                                                                                                                | `Markdown.test.tsx`, `ChatScreen.test.tsx`                      |
| Company briefing, web and mobile                                                                          | The same `Markdown`                                                                                                                                                 | `CompanyBriefingTab.test.tsx`, `CompanyBriefingScreen.test.tsx` |
| Polish preview, web and mobile                                                                            | The same `Markdown`                                                                                                                                                 | `PolishPreview.test.tsx` (web and mobile)                       |
| Draft editor, web (`DocumentDraftEditor`, TipTap `StarterKit`)                                            | `markdownToTiptapDoc` keeps links and images as plain text, and the Link extension in `StarterKit` v3 does not link loaded text (it links only what the user types) | `draftEditorLinks.test.ts` runs the real extensions             |
| PDF export (`infrastructure/pdf`)                                                                         | `ReactPdfDocumentRenderer` draws only `Text`; link marks and image nodes are dropped                                                                                | `ReactPdfDocumentRenderer.test.ts`                              |
| Parsed job description, match summary, mock-interview answers and talking points                          | Shown as plain text in a field or a paragraph                                                                                                                       | none needed: nothing is parsed as Markdown or HTML              |

## Troubleshooting

| Symptom                                                                 | Cause and fix                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `No target: pass --target …`                                            | No `--target` and no `EVAL_PROVIDER`. Pass one.                                                                                                                                                                                                                                                                           |
| `No API key for "<provider>": set …`                                    | The variables in the message are empty. Set `EVAL_API_KEY_<PROVIDER>` or `EVAL_API_KEY`.                                                                                                                                                                                                                                  |
| `These cases are graded by a judge model: set EVAL_JUDGE_…`             | The selected cases include resume or cover letter and there is no judge. Set the `EVAL_JUDGE_*` variables or leave those cases out with `--case`.                                                                                                                                                                         |
| `The custom provider needs a base URL` / HTTP 404 on `custom`           | Set `EVAL_BASE_URL` to the **full** `…/chat/completions` URL. The runner posts straight to it.                                                                                                                                                                                                                            |
| `The workersai provider needs an account id / an API token`             | Set `EVAL_CLOUDFLARE_ACCOUNT_ID` and `EVAL_CLOUDFLARE_API_TOKEN`. For the judge use the `EVAL_JUDGE_CLOUDFLARE_*` pair.                                                                                                                                                                                                   |
| Judge accuracy below 90%, exit 1                                        | The judge is too weak, or truncates (a reasoning model using its output budget). Pick a stronger or non-reasoning judge. Do not loosen the threshold.                                                                                                                                                                     |
| "The AI ran out of room before finishing its reply"                     | The reply hit the token limit. On Cloudflare, make sure you used `workersai`, not `custom`, so reasoning is turned down.                                                                                                                                                                                                  |
| "The provider rejected the request … [HTTP 400, body: …]"               | The body after `body:` is the provider's own message. Read it; it names the field it did not accept.                                                                                                                                                                                                                      |
| A chat case fails with a provider error mentioning an unavailable model | gpt-oss sometimes returns its tool call as plain text with internal markers (JEF-541). The adapter treats that as an unavailable reply and throws instead of showing the text. Hosted AI then tries its other model; an eval has one model, so the case fails. Re-run the case with `--refresh`, and compare across runs. |
| `--publish needs a Langfuse public key / secret key`                    | Set `EVAL_LANGFUSE_PUBLIC_KEY` and `EVAL_LANGFUSE_SECRET_KEY` from the project's API keys, or drop `--publish`.                                                                                                                                                                                                           |
| `Could not publish to Langfuse: …` after the report                     | The run itself is fine and the exit code is unchanged. A 401 means the keys or the region are wrong (set `EVAL_LANGFUSE_BASE_URL` for a US project); otherwise Langfuse was unreachable. Publish the saved run again with `--publish-from` (no model is called).                                                          |
| Latency says `cached`                                                   | Every reply came from the cache. Use `--refresh` for real timings.                                                                                                                                                                                                                                                        |
| The table is gone                                                       | Re-run the same command with `--cache` to rebuild it for free. Next time add `--out <file>`.                                                                                                                                                                                                                              |

## Related

- [`CLAUDE.md`](./CLAUDE.md): design notes and how to add a case.
- `apps/api/.env.example`: the template for `apps/api/.env`.
- `../infrastructure/llm/CLAUDE.md`: how hosted AI calls Workers AI, the failover and the model tiers.
