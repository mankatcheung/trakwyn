# infra/axiom: alerting on the API's telemetry

Axiom monitors and their email notifier, as Terraform (JEF-355). The API sends traces, logs and metrics to Axiom (see the Observability section of the root `CLAUDE.md`). This root is what makes somebody find out when those signals go bad. It matters most for the fail-open paths: by design, a Redis outage leaves rate limiting and session revocation quietly off while every request still succeeds.

## Monitors

All of them notify the one email notifier, `trakwyn-api alerts (email)`.

| Monitor                                         | Source                                                                                              | Fires when                                                                   | Kind                       |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------- |
| Redis fail-open                                 | `trakwyn.redis.fail_open` (metrics)                                                                 | Any fail-open in 5 min, per `component`                                      | Threshold > 0              |
| Redis circuit breaker opened                    | `trakwyn.redis.circuit_transitions` where `to == "open"` (metrics)                                  | Any breaker opens in 5 min, per `component`                                  | Threshold > 0              |
| Postgres pool errors above baseline             | `trakwyn.db.pool_errors` (metrics)                                                                  | More than `db_pool_errors_per_hour` (20) in an hour                          | Threshold                  |
| Scheduled job failed                            | `job.<name>.failed` log line                                                                        | Any job throws                                                               | MatchEvent                 |
| Scheduled job `<name>` has not completed in 26h | `job.<name>.completed` log line, one monitor per nightly job (`digest`, `reminders`, `trash_purge`) | No completion in 26 hours                                                    | Threshold < 1, and no data |
| GraphQL server-error rate                       | Root `POST /graphql …` server spans (traces)                                                        | More than `graphql_error_percent` (5%) `ERROR` in 15 min, with ≥ 20 requests | Threshold                  |
| Outbound URL refused                            | `security.outbound_url.refused` log line                                                            | Any refusal                                                                  | MatchEvent                 |

Things worth knowing about how they are written:

- **Metric names come from `METRICS` in `apps/api/src/infrastructure/observability/metrics.ts`**, and job names from `ADMIN_JOBS` in `apps/api/src/http/constants.ts`. Renaming one there silently breaks its monitor here. Nothing checks the two against each other, so change both in the same PR.
- **Metric monitors are MPL and take `increase`.** The OTel counters are cumulative per Cloud Run instance and restart at zero whenever an instance is scaled in; `increase` turns them into deltas and reads a drop as a reset.
- **Log monitors read `event` through one expression**, `local.log_event` (`['attributes.event']`). Pino fields reach Axiom as OTel log attributes, which Axiom stores as top-level `attributes.<key>` fields. Don't read them from `attributes.custom`: that map holds custom _span_ attributes only, and a query against it matches no log lines, so the absence monitors fire even though the jobs ran. If Axiom ever moves the fields, only that line changes.
- **The absence monitors are the only ones that can see Cloud Scheduler not firing**, an OIDC token rejected before the handler runs, or a deploy that broke an `/admin/*` route. None of those leave a `failed` line. `push_notifications` has no absence monitor because it is not scheduled.
- **The error-rate monitor keys on span status, not HTTP status.** GraphQL answers 200 for a failed request; `formatError` marks the root span `ERROR` only for the errors it treats as server faults, so a `NOT_FOUND` or a wrong password never counts. Root spans are matched by `kind == "server"` and name, not `isnull(parent_span_id)`: Cloud Run's front end and the web client both send `traceparent`, so the API's server span usually has a remote parent.
- **The pool-error and error-rate thresholds are guesses.** They start loose on purpose. After a week of production traffic, look at the real rates and tighten them in `terraform.tfvars`.

## Why a separate root

The monitors could live in `infra/gcp/`, but its state would then be one step away from an Axiom credential, and JEF-336 went to some length to keep secrets out of that state. Here the token is a provider argument, and Terraform never writes provider arguments to state. It lives only in the environment of whoever runs `apply`. The state (same GCS bucket as `infra/gcp`, prefix `trakwyn/axiom`) holds monitor definitions, notifier IDs and the alert addresses, none of them secret.

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and an Axiom API token for Terraform. Don't reuse the ingest-only `AXIOM_TOKEN` the API runs with.

Create the token under **Settings → API tokens → New API token**, as an **Advanced** token with custom permissions. A Basic token can only ingest, and `apply` then fails with `403: token does not have access to resource: notifiers with action: create`. Grant:

- **Organisation:** `Notifiers` and `Monitors`, each with create, read, update and delete. Terraform needs read and update for every later `plan`, and delete for `destroy` or a removed monitor.
- **Datasets:** `Query` on the logs/traces dataset (`dataset`) and the metrics dataset (`metrics_dataset`), so the monitors' queries can be checked when they are saved. The web app's server errors went to a `trakwyn-web` dataset under JEF-359; since JEF-374 they go to PostHog Error Tracking (`infra/posthog/README.md`), so a token that still has `Query` on `trakwyn-web` has one permission more than it needs.

Axiom does not let you add permissions to an existing token. If a token is missing one, delete it and create a new one.

```bash
cd infra/axiom
cp terraform.tfvars.example terraform.tfvars      # fill in datasets and alert_emails
cp .envrc.example .envrc && chmod 600 .envrc      # set the token; gitignored
source .envrc                                     # or let direnv load it
terraform init -backend-config="bucket=job-finder-503217-tfstate"
terraform plan
terraform apply
```

As with `infra/gcp`, CI only runs `fmt` and `validate` on this root. `plan` and `apply` are run by hand.

## Checking each monitor fires

A monitor that has never fired is a monitor you are trusting on faith. After the first apply, trigger each one once and confirm the email arrives:

| Monitor                         | How to trigger it                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redis fail-open, breaker opened | Run a preview or a local production build (`NODE_ENV=production` with Axiom configured) with `CACHE_PROVIDER=redis` and `UPSTASH_REDIS_REST_URL` pointed at an unreachable host, then make a few requests. Five consecutive failures open the breaker. |
| Postgres pool errors            | Temporarily set `db_pool_errors_per_hour = 0`, then let an instance sit idle past Neon's five-minute suspend with a connection open. Set it back afterwards.                                                                                           |
| Scheduled job failed            | Force a job to throw on a preview, e.g. with a bad `DATABASE_URL`, then trigger the route by hand (`CRON_SECRET`, `infra/gcp/README.md`).                                                                                                              |
| Job absence                     | `gcloud scheduler jobs pause trakwyn-api-trash-purge --location=europe-west1` and wait a day, then `resume` it. This is the acceptance test for JEF-355.                                                                                               |
| GraphQL server-error rate       | Temporarily set `graphql_error_min_requests = 1` and `graphql_error_percent = 0`, cause one server error, then revert.                                                                                                                                 |
| Outbound URL refused            | In production, save a Custom (OpenAI-compatible) provider with base URL `http://169.254.169.254`.                                                                                                                                                      |

Before relying on an MPL monitor, paste its query into Axiom's query editor against the metrics dataset. MPL was in public preview when these were written, and the editor is the quickest way to spot a query it rejects.

## Adding a monitor

1. Emit the signal first: a counter in `METRICS`, or a log line with a stable `event` field (see `SECURITY_EVENTS`). Prose log messages are not something to alert on; an edit to the wording silently breaks the monitor.
2. Add an `axiom_monitor` to `monitors.tf` under the matching section, with `notifier_ids = [axiom_notifier.email.id]`. Put the "what to do about it" in `description`, since that is what the email shows.
3. Add a row to both tables above.
4. `terraform fmt && terraform validate`, then `plan`/`apply` and trigger it once.
