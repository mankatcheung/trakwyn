# Observability: which tool owns which signal

Trakwyn sends telemetry to three tools. Each signal has one owner, so two numbers for the same thing cannot disagree (JEF-571). Put new telemetry in the tool that owns its kind of signal, and add a row here in the same PR.

**Rule of thumb:** PostHog answers questions about people and AI quality (what users did, what a generation cost, whether a reply was down-voted). Axiom answers questions about the API process (is it up, slow, erroring, spending too much). Langfuse holds offline eval runs only.

## Signals

| Signal                                                                              | Owner    | Defined in code                                                                                                 | Alerted or charted in                                                          |
| ----------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Web product analytics and errors                                                    | PostHog  | `apps/web/src/lib/analytics/` (see its `CLAUDE.md`)                                                             | PostHog; project settings in `infra/posthog/`                                  |
| Mobile product analytics, errors, native crashes                                    | PostHog  | `apps/mobile` (see its `CLAUDE.md`)                                                                             | Mobile release health dashboard, `infra/posthog/release_health.tf`             |
| Clipper health and errors                                                           | PostHog  | `apps/extension` (see its `CLAUDE.md`)                                                                          | `infra/posthog/clipper_health.tf`                                              |
| AI generations (`$ai_generation`): cost, tokens, latency, outcome                   | PostHog  | `AiAnalyticsLLMProvider`, `PostHogAiAnalytics` (`apps/api/src/infrastructure/`), behind the `IAiAnalytics` port | PostHog AI dashboards                                                          |
| AI spans (`$ai_span`)                                                               | PostHog  | `PostHogAiAnalytics.span`                                                                                       | PostHog AI dashboards                                                          |
| AI feedback (`$ai_feedback`): thumbs up/down                                        | PostHog  | `PostHogAiAnalytics.feedback`; the rows themselves are `AiFeedback` in the database                             | PostHog AI dashboards                                                          |
| API traces                                                                          | Axiom    | `infrastructure/observability/tracing.ts`                                                                       | Axiom traces dataset                                                           |
| API logs                                                                            | Axiom    | The logger; stable `event` fields such as `SECURITY_EVENTS` and `ai.feedback.rated`                             | Axiom logs dataset; the log-based monitors in `infra/axiom/monitors.tf`        |
| API metrics (`METRICS.*`)                                                           | Axiom    | `infrastructure/observability/metrics.ts`                                                                       | Axiom metrics dataset; the metric-based monitors in `infra/axiom/monitors.tf`  |
| Every API monitor (errors, jobs, pool, Redis)                                       | Axiom    | `infra/axiom/monitors.tf`                                                                                       | Email notifier; the table in `infra/axiom/README.md`                           |
| Hosted-AI spend, breaker, circuits, failover, cost mismatch, `AI_CREDITS_EXHAUSTED` | Axiom    | `trakwyn.llm.*` and `trakwyn.hosted_ai.*` in `metrics.ts`; `llm.platform.failover` log line                     | `hosted_ai_*` and `ai_credits_exhausted` monitors in `infra/axiom/monitors.tf` |
| Offline eval runs                                                                   | Langfuse | `apps/api/src/evals/` (`publish/publishToLangfuse.ts`; see `evals/README.md`)                                   | Langfuse                                                                       |

Two things look like duplicates and are not:

- `trakwyn.llm.calls`, `.duration`, `.tokens` and `.cost_micros` stay in Axiom because the hosted-AI spend monitor reads them. They are there for alerting. Charts and analysis of AI cost and quality live in PostHog; there are no AI dashboards in Axiom.
- The `ai.feedback.rated` log line stays as an audit trail in the API's own logs. It is not charted. The counter `trakwyn.ai.feedback` and its Axiom dashboard were removed in JEF-571.

## The ids that join them

| Id                   | What it is                                                                                         | Where to find it                                                                                                      |
| -------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Release SHA          | The full commit SHA an artifact was built from, or `dev`. One value across web, mobile and the API | Axiom `resource.service.version`; PostHog `release`                                                                   |
| Trace id             | The OTel trace id. PostHog's `$ai_trace_id` is this same id                                        | Axiom trace and its log lines (correlation group); PostHog `$ai_trace_id`. Without a valid trace, a random id is used |
| Pseudonymous user id | A one-way hash of the user id (`pseudonymousUserId`, `infrastructure/privacy/`)                    | PostHog distinct id on AI events and AI Gateway metadata. Recompute it from a user id to find a user's rows           |

Neither tool receives prompt, message, tool result or completion text from these signals. See `docs/ai-data-handling.md` for what leaves Trakwyn and why.
