locals {
  # APL expression for a log line's `event` field. The API's pino fields reach
  # Axiom as OTel log attributes (otelLogDestination.ts), which Axiom stores as
  # top-level `attributes.<key>` fields. The `attributes.custom` map is where it
  # puts custom *span* attributes, not log ones: reading `event` from there
  # matched nothing, so every absence monitor fired daily while the jobs ran.
  # Every log-based monitor reads the field through this one expression, so if
  # Axiom ever moves it only this line changes.
  log_event = "tostring(['attributes.event'])"

  # The /admin/* jobs Cloud Scheduler runs daily (infra/gcp/scheduler.tf), by
  # the `job` name `runScheduledJob` logs them under (ADMIN_JOBS in
  # apps/api/src/http/constants.ts). push_notifications is not scheduled, so a
  # quiet day for it means nothing.
  nightly_jobs = ["digest", "reminders", "trash_purge"]

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
resource "axiom_monitor" "graphql_error_rate" {
  name        = "GraphQL server-error rate"
  description = "Share of POST /graphql requests whose root span is ERROR, over 15 minutes. Reported as 0 below ${var.graphql_error_min_requests} requests."
  type        = "Threshold"
  apl_query   = <<-APL
    ['${var.dataset}']
    | where kind == "server" and name startswith "POST /graphql"
    | summarize total = count(), errors = countif(error == true)
    | extend error_percent = iff(total < ${var.graphql_error_min_requests}, 0.0, 100.0 * errors / total)
    | project error_percent
  APL

  operator         = "Above"
  threshold        = var.graphql_error_percent
  range_minutes    = 15
  interval_minutes = 5
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

# --- Web app server (web dataset, APL) --------------------------------------

# The web app's Vercel function (SSR renders and server functions) writes to
# its own dataset through Axiom's ingest API as plain JSON, not OTel, so
# `event` is a top-level field there and local.log_event does not apply
# (JEF-359). Every reportable event is `web.<what>.failed`
# (SERVER_LOG_EVENTS in apps/web/src/server/observability/serverLogger.ts).
# A render error inside a Suspense boundary still answers 200, which is why
# this keys on the log line rather than on HTTP status.
resource "axiom_monitor" "web_server_error" {
  name        = "Web app server error"
  description = "The web app's Vercel function failed a server render (web.ssr.failed, phase load/render/shell) or a server function (web.server_fn.failed), or a request escaped the handler (web.request.failed). The email carries the event, path and scrubbed error; vercel.request_id finds the same request in Vercel's runtime log."
  type        = "MatchEvent"
  # column_ifexists, not a bare `event`: Axiom validates the query against the
  # dataset's schema on create, and a fresh trakwyn-web has no fields until
  # its first error, so `event` alone fails the apply with "invalid field".
  apl_query = <<-APL
    ['${var.web_dataset}']
    | extend web_event = tostring(column_ifexists('event', ''))
    | where web_event startswith "web." and web_event endswith ".failed"
  APL

  # No range_minutes/interval_minutes: see job_failed above.
  notifier_ids = [axiom_notifier.email.id]
}
