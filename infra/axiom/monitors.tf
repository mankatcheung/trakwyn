locals {
  # APL expression for a log line's `event` field. The API's pino fields reach
  # Axiom as OTel log attributes (otelLogDestination.ts), which Axiom stores as
  # top-level `attributes.<key>` fields. The `attributes.custom` map is where it
  # puts custom *span* attributes, not log ones: reading `event` from there
  # matched nothing, so every absence monitor fired daily while the jobs ran.
  # Every log-based monitor reads the field through this one expression, so if
  # Axiom ever moves it only this line changes.
  log_event = "tostring(['attributes.event'])"

  # APL expression for the release (JEF-362): the commit SHA the API image was
  # built from, which tracing.ts sets as the OTel resource's service.version.
  # Read through column_ifexists because Axiom rejects a monitor query that
  # names a field the dataset has never had, which is the case until the first
  # image with APP_RELEASE serves a request. Spans from before then group
  # under "unknown".
  release = "tostring(column_ifexists('resource.service.version', 'unknown'))"

  # The /admin/* jobs Cloud Scheduler runs daily (infra/gcp/scheduler.tf), by
  # the `job` name `runScheduledJob` logs them under (ADMIN_JOBS in
  # apps/api/src/http/constants.ts). push_notifications is not scheduled, so a
  # quiet day for it means nothing.
  nightly_jobs = ["digest", "reminders", "trash_purge", "account_purge"]

  # A daily job, plus two hours of slack for a slow or late run.
  job_absence_window_minutes = 26 * 60
}

resource "axiom_notifier" "email" {
  name = "trakwyn-api alerts (email)"
  properties = {
    email = {
      emails = var.alert_emails
    }
  }
}

# --- Degraded dependencies (metrics dataset, MPL) --------------------------
#
# The OTel counters are cumulative per instance and restart at zero when Cloud
# Run scales an instance in, so every query takes `increase` rather than the
# raw value: it turns the series into per-sample deltas and treats a drop as a
# reset instead of a negative count.

resource "axiom_monitor" "redis_fail_open" {
  name        = "Redis fail-open"
  description = "A Redis-backed subsystem (cache, rate_limit, session_blocklist) degraded instead of failing. While this fires, rate limiting or session revocation may be quietly off. METRICS.REDIS_FAIL_OPEN."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.redis.fail_open`
    | map increase
    | align to 5m using sum
    | group by component using sum
  MPL

  operator         = "Above"
  threshold        = 0
  range_minutes    = 5
  interval_minutes = 5
  notify_by_group  = true
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

resource "axiom_monitor" "circuit_breaker_open" {
  name        = "Redis circuit breaker opened"
  description = "A Redis circuit breaker moved to `open`: that subsystem is now skipping Redis entirely until it half-opens. METRICS.CIRCUIT_TRANSITIONS where to = open."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.redis.circuit_transitions`
    | where to == "open"
    | map increase
    | align to 5m using sum
    | group by component using sum
  MPL

  operator         = "Above"
  threshold        = 0
  range_minutes    = 5
  interval_minutes = 5
  notify_by_group  = true
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

resource "axiom_monitor" "db_pool_errors" {
  name        = "Postgres pool errors above baseline"
  description = "Idle-client errors from the pg pool. Some are routine (Neon closes idle sockets); a rising rate means POOL_IDLE_TIMEOUT_MS is out of step with Neon. METRICS.DB_POOL_ERRORS."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.db.pool_errors`
    | map increase
    | align to 60m using sum
    | group using sum
  MPL

  operator         = "Above"
  threshold        = var.db_pool_errors_per_hour
  range_minutes    = 60
  interval_minutes = 15
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

# The two pool-saturation monitors (JEF-372). The gauges are sampled at each
# metric export (about once a minute per instance), so `increase` does not
# apply to them: a gauge is a level, not a running total.

# Sustained, not a burst: each instance's series is reduced to its *lowest*
# waiting count over the window, so one quiet sample clears it. Then the worst
# instance is taken, since one saturated instance is enough to slow requests.
resource "axiom_monitor" "db_pool_saturated" {
  name        = "Postgres pool saturated for 5 minutes"
  description = "Requests have queued for a Postgres connection on one instance for 5 minutes straight: every one of its DATABASE.POOL_MAX connections is busy. Check trakwyn.db.pool.connections (state = used) and slow traces; see DATABASE.POOL_MAX before raising it. METRICS.DB_POOL_WAITING_REQUESTS."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.db.pool.waiting_requests`
    | align to 5m using min
    | group using max
  MPL

  operator         = "Above"
  threshold        = 0
  range_minutes    = 5
  interval_minutes = 5
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

resource "axiom_monitor" "db_pool_acquire_timeout" {
  name        = "Postgres connection acquire timed out"
  description = "A query failed because it got no connection within DATABASE.POOL_CONNECTION_TIMEOUT_MS. phase = queued: the pool was saturated. phase = connecting: opening a connection was slow (Neon waking, the network). The db.pool.acquire_timeout log line has the counts. METRICS.DB_POOL_ACQUIRE_TIMEOUTS."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.db.pool_acquire_timeouts`
    | map increase
    | align to 15m using sum
    | group by phase using sum
  MPL

  operator         = "Above"
  threshold        = 0
  range_minutes    = 15
  interval_minutes = 5
  notify_by_group  = true
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

# --- Scheduled jobs (logs dataset, APL) -------------------------------------

resource "axiom_monitor" "job_failed" {
  name        = "Scheduled job failed"
  description = "A /admin/* job threw: runScheduledJob logged job.<name>.failed. The email carries the event, including which job."
  type        = "MatchEvent"
  apl_query   = <<-APL
    ['${var.logs_dataset}']
    | extend event = ${local.log_event}
    | where event startswith "job." and event endswith ".failed"
  APL

  # No range_minutes/interval_minutes: a match monitor fires per matching
  # event, and Axiom stores both as 1 whatever is sent, which the provider
  # then reports as an inconsistent result after apply.
  notifier_ids = [axiom_notifier.email.id]
}

resource "axiom_monitor" "account_purge_overdue" {
  name        = "Account deletion overdue"
  description = "An account scheduled for deletion is still there 3 days after its date: the purge keeps failing for it (often the payment provider refusing to revoke the subscription). The owner was promised a date. PurgeScheduledAccountsUseCase logs account_purge.overdue (ACCOUNT_DELETION.OVERDUE_EVENT); the per-account error is in the same run's logs."
  type        = "MatchEvent"
  apl_query   = <<-APL
    ['${var.logs_dataset}']
    | extend event = ${local.log_event}
    | where event == "account_purge.overdue"
  APL

  notifier_ids = [axiom_notifier.email.id]
}

# Absence, not failure: catches Cloud Scheduler not firing, an OIDC token
# rejected before the handler runs, or a deploy that broke the route. None of
# those produce a job.<name>.failed line, which is why this cannot be an error
# monitor. `summarize count()` without `by` returns one row even over no data,
# so the zero reaches the threshold instead of reading as "no data".
resource "axiom_monitor" "job_missing" {
  for_each = toset(local.nightly_jobs)

  name        = "Scheduled job ${each.key} has not completed in 26h"
  description = "No job.${each.key}.completed in the last 26 hours. Check the trakwyn-api-* Cloud Scheduler job, then job.${each.key}.misconfigured and job.${each.key}.failed in the logs."
  type        = "Threshold"
  apl_query   = <<-APL
    ['${var.logs_dataset}']
    | where ${local.log_event} == "job.${each.key}.completed"
    | summarize count()
  APL

  operator         = "Below"
  threshold        = 1
  range_minutes    = local.job_absence_window_minutes
  interval_minutes = 60
  # Belt and braces: if Axiom ever treats the empty result as no data rather
  # than zero, that still has to alert.
  alert_on_no_data = true
  notifier_ids     = [axiom_notifier.email.id]
}

# --- Request health (traces dataset, APL) -----------------------------------

# GraphQL answers 200 for a failed request, so the HTTP status is useless
# here. formatError marks the root span ERROR for the errors it treats as
# server faults (not NOT_FOUND or a wrong password), which is what "5xx"
# means for this API. Root spans are matched by kind and name rather than
# `isnull(parent_span_id)`: Cloud Run's front end and the web client both
# send `traceparent`, so the API's server span usually has a remote parent.
#
# Grouped by release (JEF-362), so the email names the deploy the errors came
# from, and a bad deploy rolling out beside a good one isn't averaged away.
resource "axiom_monitor" "graphql_error_rate" {
  name        = "GraphQL server-error rate"
  description = "Share of POST /graphql requests whose root span is ERROR, over 15 minutes, per release (commit SHA). Reported as 0 below ${var.graphql_error_min_requests} requests."
  type        = "Threshold"
  apl_query   = <<-APL
    ['${var.dataset}']
    | where kind == "server" and name startswith "POST /graphql"
    | extend release = ${local.release}
    | summarize total = count(), errors = countif(error == true) by release
    | extend error_percent = iff(total < ${var.graphql_error_min_requests}, 0.0, 100.0 * errors / total)
    | project release, error_percent
  APL

  operator         = "Above"
  threshold        = var.graphql_error_percent
  range_minutes    = 15
  interval_minutes = 5
  notify_by_group  = true
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

# --- Security mechanisms (logs dataset, APL) --------------------------------

# From the log line rather than METRICS.OUTBOUND_URL_REFUSED: the log carries
# the reason and purpose, and the email then says what was refused. At current
# traffic any refusal is worth a look.
resource "axiom_monitor" "outbound_url_refused" {
  name        = "Outbound URL refused"
  description = "OutboundUrlPolicy refused a URL a user supplied (SECURITY_EVENTS.OUTBOUND_URL_REFUSED). Either a misconfigured custom provider or someone probing for SSRF."
  type        = "MatchEvent"
  apl_query   = <<-APL
    ['${var.logs_dataset}']
    | where ${local.log_event} == "security.outbound_url.refused"
  APL

  # No range_minutes/interval_minutes: a match monitor fires per matching
  # event, and Axiom stores both as 1 whatever is sent, which the provider
  # then reports as an inconsistent result after apply.
  notifier_ids = [axiom_notifier.email.id]
}

# --- Hosted AI guards (JEF-449) ---------------------------------------------
#
# Three layers sit in front of the platform's keys: the daily breaker in the
# API, the provider-side budgets (infra/gcp/README.md, "Hosted AI spend
# budgets") and these monitors, which say when the first two are doing work.
# Same `increase` rule as above.

resource "axiom_monitor" "hosted_ai_hourly_cost" {
  name        = "Hosted AI spend above ${var.hosted_ai_hourly_cost_usd} USD an hour"
  description = "Estimated platform LLM spend (METRICS.LLM_COST_MICROS, source = platform) over the last hour. The daily breaker (HOSTED_AI.DAILY_BUDGET_MICROS) is the hard stop; this is the early warning that something is spending fast."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.llm.cost_micros`
    | filter source == "platform"
    | map increase
    | align to 1h using sum
    | group using sum
  MPL

  operator         = "Above"
  threshold        = var.hosted_ai_hourly_cost_usd * 1000000
  range_minutes    = 60
  interval_minutes = 15
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

# The price table in the API (`LLM_PRICES.workersai`) is typed in by hand, so a
# Cloudflare price change would go unnoticed. Each platform response carries
# Workers AI's own `neurons`; METRICS.LLM_COST_MISMATCH counts calls where the
# table's estimate and the neurons-based cost differ by more than
# `WORKERS_AI_BILLING.MISMATCH_TOLERANCE` (JEF-497). direction = under: the
# table is too low and real spend is higher than the breaker believes.
resource "axiom_monitor" "hosted_ai_cost_mismatch" {
  name        = "Hosted AI cost estimate off from Cloudflare's neurons"
  description = "Platform calls whose price-table estimate and neurons-based cost disagree (METRICS.LLM_COST_MISMATCH). Check LLM_PRICES.workersai against the model pages. direction = under means real spend is higher than the daily breaker counts."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.llm.cost_mismatch`
    | map increase
    | align to 1h using sum
    | group by model, direction using sum
  MPL

  operator         = "Above"
  threshold        = var.hosted_ai_cost_mismatch_per_hour
  range_minutes    = 60
  interval_minutes = 15
  notify_by_group  = true
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

resource "axiom_monitor" "hosted_ai_breaker_open" {
  name        = "Hosted AI breaker open"
  description = "The daily spend breaker refused a hosted AI call (METRICS.HOSTED_AI_BREAKER_OPEN). reason = over_budget: the day's budget is spent, so Trakwyn AI is off until 00:00 UTC. reason = store_error: Redis could not be read and the breaker failed closed."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.hosted_ai.breaker_open`
    | map increase
    | align to 5m using sum
    | group by reason using sum
  MPL

  operator         = "Above"
  threshold        = 0
  range_minutes    = 5
  interval_minutes = 5
  notify_by_group  = true
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

# A hosted model's health circuit (JEF-504), not the spend breaker above: it
# opens when a model has failed three calls in a row (5xx, timeout, dropped
# connection), after which calls skip that model without a request for 30 s at a
# time. 4xx, 429 and a refused token never open it, so an alert here is the model
# or the gateway being down. `trakwyn.hosted_ai.circuit_short_circuits` (by
# model) says how many calls it turned away; chart it beside this one.
resource "axiom_monitor" "hosted_ai_circuit_open" {
  name        = "Hosted AI model circuit opened"
  description = "A Workers AI model's health circuit moved to open (METRICS.HOSTED_AI_CIRCUIT_TRANSITIONS where to = open): three failed calls in a row on one API instance, so that instance now skips the model. Both models opening means Trakwyn AI is down for it and users fall through to their own keys."
  type        = "Threshold"
  mpl_query   = <<-MPL
    `${var.metrics_dataset}`:`trakwyn.hosted_ai.circuit_transitions`
    | where to == "open"
    | map increase
    | align to 5m using sum
    | group by model using sum
  MPL

  operator         = "Above"
  threshold        = 0
  range_minutes    = 5
  interval_minutes = 5
  notify_by_group  = true
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

# The failover line is the only signal: nothing counts successful platform
# calls in the logs dataset, so this is a count, not the share of calls that
# the ticket asked for. At launch volume a count is the more useful number.
resource "axiom_monitor" "hosted_ai_failover" {
  name        = "Hosted AI failing over"
  description = "More than ${var.hosted_ai_failover_per_hour} llm.platform.failover lines in an hour: the primary platform provider is rate limiting or down and calls are running on the fallback, at its price."
  type        = "Threshold"
  apl_query   = <<-APL
    ['${var.logs_dataset}']
    | where ${local.log_event} == "llm.platform.failover"
    | summarize count()
  APL

  operator         = "Above"
  threshold        = var.hosted_ai_failover_per_hour
  range_minutes    = 60
  interval_minutes = 15
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

# Read from the use-case spans (traceUseCase records app.error.code), since a
# DomainError is an expected error and is not logged. Custom span attributes
# live in the `attributes.custom` map, read through column_ifexists because
# Axiom rejects a query that names a field the dataset has never had.
resource "axiom_monitor" "ai_credits_exhausted" {
  name        = "AI_CREDITS_EXHAUSTED spike"
  description = "More than ${var.ai_credits_exhausted_per_hour} use-case spans ended in AI_CREDITS_EXHAUSTED in an hour. One user running out is normal; a spike means the credit sizes are wrong or an account is being farmed."
  type        = "Threshold"
  apl_query   = <<-APL
    ['${var.dataset}']
    | where tostring(column_ifexists('attributes.custom', dynamic({}))['app.error.code']) == "AI_CREDITS_EXHAUSTED"
    | summarize count()
  APL

  operator         = "Above"
  threshold        = var.ai_credits_exhausted_per_hour
  range_minutes    = 60
  interval_minutes = 15
  alert_on_no_data = false
  notifier_ids     = [axiom_notifier.email.id]
}

