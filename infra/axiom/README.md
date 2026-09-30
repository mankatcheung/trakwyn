# infra/axiom: alerting on the API's telemetry

Axiom monitors and their email notifier, as Terraform (JEF-355). The API sends traces, logs and metrics to Axiom, each to its own dataset (see the Observability section of `apps/api/CLAUDE.md`). This root is what makes somebody find out when those signals go bad. It matters most for the fail-open paths: by design, a Redis outage leaves rate limiting and session revocation quietly off while every request still succeeds.

## Datasets

One dataset per OTel signal (JEF-373), which is what Axiom's OTel guide asks for:

| Dataset               | Kind    | API env var             | Terraform variable |
| --------------------- | ------- | ----------------------- | ------------------ |
| `trakwyn-api`         | Events  | `AXIOM_DATASET`         | `dataset`          |
| `trakwyn-api-logs`    | Events  | `AXIOM_LOGS_DATASET`    | `logs_dataset`     |
| `trakwyn-api-metrics` | Metrics | `AXIOM_METRICS_DATASET` | `metrics_dataset`  |

Until JEF-373, logs shared `trakwyn-api` with traces. Log rows written before the cutover stay there until retention ages them out. Query `trakwyn-api-logs` for anything newer.

The datasets themselves are created by hand in Axiom (**Datasets → New dataset**), not in Terraform.

### Correlation group

A trace and its log lines now live in different datasets. An Axiom [correlation group](https://axiom.co/docs/query-data/correlations) joins them back up by trace ID, so opening a trace shows its log lines, and a log line links to its trace. The Axiom Terraform provider (1.6.3) has no resource for correlation groups, so create it by hand once:

1. **Datasets → Correlations → New correlation group**.
2. Add `trakwyn-api` (traces), `trakwyn-api-logs` (logs) and `trakwyn-api-metrics` (metrics).
3. Open a recent `POST /graphql …` trace in `trakwyn-api` and check that its log lines appear, then open a log line in `trakwyn-api-logs` and follow it back to its trace.

If the provider gains a resource for it, move the group into this root.

## Monitors

All of them notify both notifiers: the email notifier `trakwyn-api alerts (email)`, and `trakwyn-api alerts (Linear relay)`, which files a Linear issue (JEF-382, "Linear issues" below). Both are in `local.notifier_ids`.

| Monitor                                         | Source                                                                                         | Fires when                                                                                | Kind                       |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------- |
| Redis fail-open                                 | `trakwyn.redis.fail_open` (metrics)                                                            | Any fail-open in 5 min, per `component`                                                   | Threshold > 0              |
| Redis circuit breaker opened                    | `trakwyn.redis.circuit_transitions` where `to == "open"` (metrics)                             | Any breaker opens in 5 min, per `component`                                               | Threshold > 0              |
| Postgres pool errors above baseline             | `trakwyn.db.pool_errors` (metrics)                                                             | More than `db_pool_errors_per_hour` (20) in an hour                                       | Threshold                  |
| Postgres pool saturated for 5 minutes           | `trakwyn.db.pool.waiting_requests` gauge (metrics)                                             | Some instance had requests waiting at every sample for 5 min                              | Threshold > 0              |
| Postgres connection acquire timed out           | `trakwyn.db.pool_acquire_timeouts` (metrics)                                                   | Any acquire timeout in 15 min, per `phase` (`queued`/`connecting`)                        | Threshold > 0              |
| Scheduled job failed                            | `job.<name>.failed` line (logs)                                                                | Any job throws                                                                            | MatchEvent                 |
| Scheduled job `<name>` has not completed in 26h | `job.<name>.completed` line (logs), one per nightly job (`digest`, `reminders`, `trash_purge`) | No completion in 26 hours                                                                 | Threshold < 1, and no data |
| GraphQL server-error rate                       | Root `POST /graphql …` server spans (traces)                                                   | More than `graphql_error_percent` (5%) `ERROR` in 15 min, with ≥ 20 requests, per release | Threshold                  |
| Outbound URL refused                            | `security.outbound_url.refused` line (logs)                                                    | Any refusal                                                                               | MatchEvent                 |
| Use case failed unexpectedly                    | `<UseCase>.execute` spans with `error` and no `app.error.code` (traces)                        | A use case throws something that is not a `DomainError`                                   | MatchEvent                 |

Things worth knowing about how they are written:

- **Metric names come from `METRICS` in `apps/api/src/infrastructure/observability/metrics.ts`**, and job names from `ADMIN_JOBS` in `apps/api/src/http/constants.ts`. Renaming one there silently breaks its monitor here. Nothing checks the two against each other, so change both in the same PR.
- **Metric monitors are MPL and take `increase`.** The OTel counters are cumulative per Cloud Run instance and restart at zero whenever an instance is scaled in; `increase` turns them into deltas and reads a drop as a reset.
- **The pool-saturation monitor is the exception: it reads a gauge** (JEF-372), a level sampled at each export rather than a running total, so it takes no `increase`. It aligns each instance to its _lowest_ waiting count over 5 minutes, so one sample with an empty queue clears it, and a single burst never fires. The gauges are the API's own (`trakwyn.db.pool.*`), not instrumentation-pg's `db.client.connection.*`: those only update on a pool event, so they stand still when every connection is stuck.
- **Log monitors query `logs_dataset` and read `event` through one expression**, `local.log_event` (`['attributes.event']`). Pino fields reach Axiom as OTel log attributes, which Axiom stores as top-level `attributes.<key>` fields. Don't read them from `attributes.custom`: that map holds custom _span_ attributes only, and a query against it matches no log lines, so the absence monitors fire even though the jobs ran. If Axiom ever moves the fields, only that line changes. Since JEF-373, spans are no longer in the same dataset, so the two schemas can't be confused within one query.
- **The absence monitors are the only ones that can see Cloud Scheduler not firing**, an OIDC token rejected before the handler runs, or a deploy that broke an `/admin/*` route. None of those leave a `failed` line. `push_notifications` has no absence monitor because it is not scheduled.
- **The error-rate monitor is the one monitor on `dataset` (traces), and it keys on span status, not HTTP status.** GraphQL answers 200 for a failed request; `formatError` marks the root span `ERROR` only for the errors it treats as server faults, so a `NOT_FOUND` or a wrong password never counts. Root spans are matched by `kind == "server"` and name, not `isnull(parent_span_id)`: Cloud Run's front end and the web client both send `traceparent`, so the API's server span usually has a remote parent.
- **The error-rate monitor is grouped by release** (JEF-362), read through `local.release` (`resource.service.version`, via `column_ifexists`; see below): the commit SHA `deploy-api` bakes into the image. The email then names the deploy, and a bad revision rolling out beside a good one isn't averaged away. The match monitors need no grouping, since their email carries the whole event and the release with it. The absence and metric monitors stay ungrouped: a group-by returns no rows over no data, which would silence the absence monitors.
- **The pool-error and error-rate thresholds are guesses.** They start loose on purpose. After a week of production traffic, look at the real rates and tighten them in `terraform.tfvars`.

## Linear issues (JEF-382)

Every monitor also notifies `axiom_notifier.linear_relay`, a custom webhook that posts to the API's `POST /webhooks/axiom-alerts` (`apps/api/src/http/routes/alertWebhook.routes.ts`). The API files the Linear issue itself. Axiom's template can't talk to Linear directly: it JSON-escapes only `MatchedEvent`, `GroupKeys` and `GroupValues`, and pastes every other field in raw.

What the relay does with a notification:

- **`Closed` (recovered):** ignored.
- **Dedupe:** each alert gets a fingerprint. For an error in a matched span or log line, that is the monitor plus the exception type and the top stack frame, without line numbers so a redeploy keeps it. For a grouped threshold it is the monitor plus the group; otherwise the monitor alone. While a Linear issue carrying that fingerprint is open, later alerts for it file nothing. Once someone completes or cancels the issue, the next alert files a new one.
- **Rate limit:** at most `RATE_LIMIT.ALERT_ISSUE` (20) new issues an hour across all monitors. Duplicates don't count. Past that, alerts still email.
- **The issue:** titled `[Axiom] <monitor>: <exception type> — <message>` (or `<monitor> (<group>)`). It lists the monitor, time, window, value, group, release (commit SHA), log event, error code and trace ID. It also includes the exception and stack trace, and the whole matched event as JSON. Drizzle's `params:` lines are redacted first, as in the logs (JEF-348), and long blocks are cut at 8,000 characters.

**The new monitor, "Use case failed unexpectedly",** is what gives the API's errors their own issues. `traceUseCase` records the exception, with message and stack, on every `<UseCase>.execute` span and sets `app.error.code` only for a `DomainError`. So an errored span without that attribute is an unplanned server fault. The expected failures, such as `NOT_FOUND` or a wrong password, never match. It excludes `FileAlertIssueUseCase.execute`, the relay's own span. Otherwise a Linear outage would alert the relay about itself. It is also why the relay's `alerts.webhook.*` log events must never be what a monitor matches.

**The webhook body is plain text with quotes around it**, so a monitor name or description must not contain `"` or `\`. `terraform_data.relay_safe_monitor_text` fails the plan if one does. A new monitor must be added to its `local.relayed_monitor_text` list.

**The relay's secret is in this root's state.** The notifier's `Authorization` header is `sensitive` in the provider, but Terraform still writes it to state, unlike the Axiom token, which is a provider argument. What it guards is only the ability to file issues in one Linear team, through a rate-limited route, and the state bucket's access already limits who can read it. The Linear API key itself never comes near this root: it lives in Secret Manager (`linear-api-key`, `infra/gcp`). To rotate the secret, add a new `alert-webhook-secret` version, roll out a revision, then `apply` here with the new `TF_VAR_alert_webhook_secret`. Alerts sent in between are refused with 401 and still email.

### Turning it on

1. Create a Linear personal API key (**Settings → Account → Security & access → Personal API keys**) with access to the Trakwyn team only, if your plan allows it. Generate the webhook secret with `openssl rand -hex 32`.
2. Add both to Secret Manager: put `LINEAR_API_KEY` and `ALERT_WEBHOOK_SECRET` in the env file and run `infra/gcp/load-secrets.sh`, or use `gcloud secrets versions add linear-api-key` and `alert-webhook-secret` by hand. Do this first: `infra/gcp` now lists both in `secret_env_vars`, and Cloud Run won't start a revision that references a secret with no version.
3. In `infra/gcp`, set `LINEAR_TEAM_ID` in `plain_env` (the UUID is in `terraform.tfvars.example`), `apply`, and let the revision roll out. Check it: `curl -s -o /dev/null -w '%{http_code}' -X POST https://api.trakwyn.com/webhooks/axiom-alerts` should print `401`, not `503`.
4. Here, set `api_origin` in `terraform.tfvars` and `TF_VAR_alert_webhook_secret` in `.envrc`. Run `plan`: expect one notifier, the new monitor and the guard to be created, and every monitor's `notifier_ids` to change in place. Then `apply`.
5. Trigger "Scheduled job failed" or "Outbound URL refused" once ("Checking each monitor fires"). An issue should appear in the Trakwyn team with the matched event. Trigger it again: the second one must not file a second issue while the first is open. Then close the issue.

## Why a separate root

The monitors could live in `infra/gcp/`, but its state would then be one step away from an Axiom credential, and JEF-336 went to some length to keep secrets out of that state. Here the token is a provider argument, and Terraform never writes provider arguments to state. It lives only in the environment of whoever runs `apply`. The state (same GCS bucket as `infra/gcp`, prefix `trakwyn/axiom`) holds monitor definitions, notifier IDs and the alert addresses, none of them secret.

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and an Axiom API token for Terraform. Don't reuse the ingest-only `AXIOM_TOKEN` the API runs with.

Create the token under **Settings → API tokens → New API token**, as an **Advanced** token with custom permissions. A Basic token can only ingest, and `apply` then fails with `403: token does not have access to resource: notifiers with action: create`. Grant:

- **Organisation:** `Notifiers` and `Monitors`, each with create, read, update and delete. Terraform needs read and update for every later `plan`, and delete for `destroy` or a removed monitor.
- **Datasets:** `Query` on the traces dataset (`dataset`), the logs dataset (`logs_dataset`) and the metrics dataset (`metrics_dataset`), so the monitors' queries can be checked when they are saved. A token made before JEF-373 lacks the logs dataset and has to be replaced (see below). The web app's server errors went to a `trakwyn-web` dataset under JEF-359; since JEF-374 they go to PostHog Error Tracking (`infra/posthog/README.md`), so a token that still has `Query` on `trakwyn-web` has one permission more than it needs.

The API's own ingest `AXIOM_TOKEN` (Secret Manager secret `axiom-token`, `infra/gcp`) needs `Ingest` on all three API datasets. If it is scoped per dataset rather than org-wide, a token made before JEF-373 can't write to `trakwyn-api-logs`, so replace it as well.

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

### Grouping the error rate by release (JEF-362)

Axiom rejects a monitor query that names a field the dataset has never had (`400 … invalid field: "resource.service.version"`), and no span has that field until `deploy-api` ships an image built with `APP_RELEASE` and it serves a request. `local.release` therefore reads the field through `column_ifexists(…, 'unknown')`, so `apply` succeeds either side of that deploy, and spans from before it group under `unknown`. `plan` should show only `graphql_error_rate` changing in place.

Once the new image has served a `POST /graphql`, check that the field name is the one Axiom actually stores. Run this in the traces dataset; it should return the deployed commit SHA, not `unknown`:

```kusto
['trakwyn-api'] | where kind == "server" | take 1 | project release = column_ifexists('resource.service.version', 'unknown')
```

If it returns `unknown` while the span's `resource` shows a `service.version`, update `local.release` to the path Axiom shows.

### Cutting over to a new logs dataset (JEF-373)

The order matters. Pointing the absence monitors at an empty dataset makes all three fire, and Axiom rejects a monitor query against a dataset that has no `attributes.event` field yet.

1. Create the `trakwyn-api-logs` Events dataset. If the API's ingest token is scoped per dataset, create a new one with `Ingest` on all three API datasets and add it as a new version of the `axiom-token` secret.
2. In `infra/gcp`, set `AXIOM_LOGS_DATASET = "trakwyn-api-logs"` in `plain_env`, `terraform apply`, and let the new revision roll out.
3. Wait for one nightly run of `digest`, `reminders` and `trash_purge`, or trigger them by hand (`infra/gcp/README.md`), until a `job.<name>.completed` line for each is in `trakwyn-api-logs`.
4. Replace the Terraform token here with one that can also query `trakwyn-api-logs`. Then set `logs_dataset` in `terraform.tfvars`, `plan` (expect the five log monitors to change in place) and `apply`.
5. Create the correlation group (above), then trigger each moved monitor once (below).

## Checking each monitor fires

A monitor that has never fired is a monitor you are trusting on faith. After the first apply, trigger each one once and confirm the email arrives:

| Monitor                         | How to trigger it                                                                                                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redis fail-open, breaker opened | Run a preview or a local production build (`NODE_ENV=production` with Axiom configured) with `CACHE_PROVIDER=redis` and `UPSTASH_REDIS_REST_URL` pointed at an unreachable host, then make a few requests. Five consecutive failures open the breaker.                                                                                      |
| Postgres pool errors            | Temporarily set `db_pool_errors_per_hour = 0`, then let an instance sit idle past Neon's five-minute suspend with a connection open. Set it back afterwards.                                                                                                                                                                                |
| Pool saturated, acquire timeout | Run a local production build against a Postgres URL with `DATABASE.POOL_MAX` temporarily set to `1`, then keep firing parallel requests that each hold a connection (e.g. `SELECT pg_sleep(2)` in a scratch resolver) for five minutes. Queued requests past 10 s also trip the timeout monitor with `phase = queued`. Revert the constant. |
| Scheduled job failed            | Force a job to throw on a preview, e.g. with a bad `DATABASE_URL`, then trigger the route by hand (`CRON_SECRET`, `infra/gcp/README.md`).                                                                                                                                                                                                   |
| Job absence                     | `gcloud scheduler jobs pause trakwyn-api-trash-purge --location=europe-west1` and wait a day, then `resume` it. This is the acceptance test for JEF-355.                                                                                                                                                                                    |
| GraphQL server-error rate       | Temporarily set `graphql_error_min_requests = 1` and `graphql_error_percent = 0`, cause one server error, then revert.                                                                                                                                                                                                                      |
| Outbound URL refused            | In production, save a Custom (OpenAI-compatible) provider with base URL `http://169.254.169.254`.                                                                                                                                                                                                                                           |

Before relying on an MPL monitor, paste its query into Axiom's query editor against the metrics dataset. MPL was in public preview when these were written, and the editor is the quickest way to spot a query it rejects.

## Adding a monitor

1. Emit the signal first: a counter in `METRICS`, or a log line with a stable `event` field (see `SECURITY_EVENTS`). Prose log messages are not something to alert on; an edit to the wording silently breaks the monitor.
2. Add an `axiom_monitor` to `monitors.tf` under the matching section, with `notifier_ids = local.notifier_ids`, and add it to `local.relayed_monitor_text`. Put the "what to do about it" in `description`, since that is what the email and the Linear issue show. Its name and description must not contain `"` or `\` ("Linear issues" above).
3. Add a row to both tables above.
4. `terraform fmt && terraform validate`, then `plan`/`apply` and trigger it once.
