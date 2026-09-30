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
  nightly_jobs = ["digest", "reminders", "trash_purge"]

  # A daily job, plus two hours of slack for a slow or late run.
  job_absence_window_minutes = 26 * 60

  # Every monitor emails and files a Linear issue through the API's relay
  # (JEF-382). Email stays: it is the one channel that still works when the
  # API itself is down.
  notifier_ids = [axiom_notifier.email.id, axiom_notifier.linear_relay.id]

  # The relay's own use-case span (FileAlertIssueUseCase in apps/api). When
  # Linear is down that span fails, and a monitor that matched it would call
  # the relay again about its own failure: a loop.
  relay_use_case_span = "FileAlertIssueUseCase.execute"
}

resource "axiom_notifier" "email" {
  name = "trakwyn-api alerts (email)"
  properties = {
    email = {
      emails = var.alert_emails
    }
  }
}

# The API's Axiom -> Linear relay (JEF-382, apps/api
# http/routes/alertWebhook.routes.ts). Axiom's template JSON-escapes only
# MatchedEvent, GroupKeys and GroupValues; every other field is pasted in
# raw. So value and the times go as strings, and a monitor's name or
# description must not contain a double quote or a backslash
# (terraform_data.relay_safe_monitor_text enforces it). .Body is left out:
# it is Axiom's own rendering and can contain anything.
resource "axiom_notifier" "linear_relay" {
  name = "trakwyn-api alerts (Linear relay)"
  properties = {
    custom_webhook = {
      url = "${var.api_origin}/webhooks/axiom-alerts"
      headers = {
        Authorization = "Bearer ${var.alert_webhook_secret}"
      }
      body = <<-JSON
        {
          "action": "{{.Action}}",
          "monitorId": "{{.MonitorID}}",
          "title": "{{.Title}}",
          "description": "{{.Description}}",
          "timestamp": "{{.Timestamp}}",
          "queryStartTime": "{{.QueryStartTime}}",
          "queryEndTime": "{{.QueryEndTime}}",
          "value": "{{.Value}}",
          "matchedEvent": {{jsonObject .MatchedEvent}},
          "groupKeys": {{jsonArray .GroupKeys}},
          "groupValues": {{jsonArray .GroupValues}}
        }
      JSON
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
  notifier_ids     = local.notifier_ids
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
  notifier_ids     = local.notifier_ids
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
  notifier_ids     = local.notifier_ids
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
  notifier_ids     = local.notifier_ids
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
  notifier_ids     = local.notifier_ids
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
  notifier_ids = local.notifier_ids
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
  notifier_ids     = local.notifier_ids
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
  notifier_ids     = local.notifier_ids
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
  notifier_ids = local.notifier_ids
}

# --- Server faults (traces dataset, APL) ------------------------------------

# One Linear issue per distinct server fault, with its stack trace (JEF-382).
# traceUseCase records the exception on each use case's span, and sets
# app.error.code only for a DomainError. A span that failed *without* one
# threw something nobody planned for, which is what "server fault" means
# here: a NOT_FOUND or a wrong password is a DomainError and never matches.
#
# A match monitor fires per span, so a fault on every request fires on every
# request. The relay fingerprints each by exception type and throw site and
# files one issue while that issue stays open (README.md, "Linear issues").
resource "axiom_monitor" "use_case_failed" {
  name        = "Use case failed unexpectedly"
  description = "A use case threw an error that is not a DomainError: an unplanned server fault. The Linear issue carries the exception, its stack trace and the trace ID; open the trace in Axiom for the request around it."
  type        = "MatchEvent"
  apl_query   = <<-APL
    ['${var.dataset}']
    | where error == true and name endswith ".execute" and name != "${local.relay_use_case_span}"
    | where isempty(tostring(['attributes.custom']['app.error.code']))
  APL

  # No range_minutes/interval_minutes: see outbound_url_refused.
  notifier_ids = local.notifier_ids
}

# The relay's body template pastes .Title and .Description in unescaped. A
# double quote or backslash in either would turn every notification from
# that monitor into invalid JSON, which the relay can only refuse, so the
# plan refuses it first.
resource "terraform_data" "relay_safe_monitor_text" {
  input = local.relayed_monitor_text

  lifecycle {
    precondition {
      condition     = alltrue([for text in local.relayed_monitor_text : length(regexall("[\"\\\\]", text)) == 0])
      error_message = "A monitor name or description contains a double quote or a backslash, which the Linear relay's webhook body cannot carry. Reword it."
    }
  }
}

locals {
  relayed_monitor_text = flatten([
    for monitor in concat(
      [
        axiom_monitor.redis_fail_open,
        axiom_monitor.circuit_breaker_open,
        axiom_monitor.db_pool_errors,
        axiom_monitor.db_pool_saturated,
        axiom_monitor.db_pool_acquire_timeout,
        axiom_monitor.job_failed,
        axiom_monitor.graphql_error_rate,
        axiom_monitor.outbound_url_refused,
        axiom_monitor.use_case_failed,
      ],
      values(axiom_monitor.job_missing),
    ) : [monitor.name, monitor.description]
  ])
}
