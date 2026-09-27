# Mobile release health (JEF-368): crash-free sessions and users per app
# version and per release, the view PostHog has no built-in equivalent of.
# Definitions (what a crash is, what a session is) are in README.md and on
# the dashboard's first tile.
#
# The three tables are HogQL in queries/, so they can be pasted into the SQL
# editor as they are. The two charts are trends queries rather than HogQL,
# because PostHog alerts only run on trends insights.

locals {
  # posthog-react-native sends every JS event. Native crashes are sent by the
  # native SDK underneath it on the next launch; iOS reports itself as
  # posthog-react-native, the other two are listed in case a platform does
  # not. Web ($lib = web) and the web server (trakwyn-web-server) share this
  # project, so every mobile query filters on this.
  mobile_libs = ["posthog-react-native", "posthog-ios", "posthog-android"]

  mobile_filter = [{
    type     = "event"
    key      = "$lib"
    operator = "exact"
    value    = local.mobile_libs
  }]

  fatal_exception = "event = '$exception' AND properties.$exception_level = 'fatal'"
}

resource "posthog_dashboard" "mobile_release_health" {
  name        = "Mobile release health"
  description = "Crash-free sessions and users per mobile app version and release (JEF-368). Managed in infra/posthog; edits made here are reverted on the next apply."
  tags        = ["mobile", "terraform"]
}

resource "posthog_insight" "crash_free_by_version" {
  name          = "Crash-free sessions and users by app version (30 days)"
  description   = "A session is crashed if it has a fatal $exception. Newest version first."
  query_sql     = file("${path.module}/queries/crash_free_by_version.sql")
  dashboard_ids = [posthog_dashboard.mobile_release_health.id]
  tags          = ["mobile", "release-health"]
}

resource "posthog_insight" "crash_free_by_release" {
  name          = "Crash-free sessions and users by release (30 days)"
  description   = "As by app version, split by build and the release commit SHA (JEF-362). Native crashes carry no release, so a session takes its release from its other events."
  query_sql     = file("${path.module}/queries/crash_free_by_release.sql")
  dashboard_ids = [posthog_dashboard.mobile_release_health.id]
  tags          = ["mobile", "release-health"]
}

resource "posthog_insight" "top_exceptions" {
  name          = "Top exceptions: latest app version vs. the previous one"
  description   = "Mobile $exception issues in the two newest app versions (by first seen), by sessions affected. Fatal columns count crashes only."
  query_sql     = file("${path.module}/queries/top_exceptions_latest_vs_previous.sql")
  dashboard_ids = [posthog_dashboard.mobile_release_health.id]
  tags          = ["mobile", "release-health"]
}

# The trend of the version table: one line per app version, so a new
# release's rate can be read against the one before it day by day.
resource "posthog_insight" "crash_free_sessions_daily" {
  name        = "Crash-free sessions % by app version, daily"
  description = "Unguarded: a day with few sessions can swing to anything. The alert below uses the guarded rate."
  query_json = jsonencode({
    kind = "InsightVizNode"
    source = {
      kind = "TrendsQuery"
      series = [{
        kind        = "EventsNode"
        event       = null
        name        = "All events"
        custom_name = "Crash-free sessions %"
        math        = "hogql"
        math_hogql  = "round(100 * (1 - uniqIf($session_id, ${local.fatal_exception}) / uniq($session_id)), 2)"
      }]
      interval   = "day"
      dateRange  = { date_from = "-30d" }
      properties = local.mobile_filter
      breakdownFilter = {
        breakdown      = "$app_version"
        breakdown_type = "event"
      }
      trendsFilter = { display = "ActionsLineGraph" }
    }
  })
  dashboard_ids = [posthog_dashboard.mobile_release_health.id]
  tags          = ["mobile", "release-health"]
}

# What the alert watches. Two choices keep it quiet when nothing is wrong:
#
# - It is the crashed-session rate, alerting above a ceiling, not the
#   crash-free rate below a floor. Trends fill a day with no events with 0,
#   and 0% crash-free on a quiet day would page; 0% crashed does not.
# - Below the minimum session count the rate is reported as 0, so one crash
#   on a day-old build with five sessions is not a 20% crash rate. Same
#   guard as infra/axiom's graphql_error_min_requests.
resource "posthog_insight" "crashed_sessions_alert" {
  name        = "Crashed sessions % (alert)"
  description = "Share of mobile sessions with a fatal $exception, per day. Reads 0 below ${var.crash_alert_min_sessions} sessions a day. ${var.crash_alert_app_version == null ? "All app versions." : "App version ${var.crash_alert_app_version} only."}"
  query_json = jsonencode({
    kind = "InsightVizNode"
    source = {
      kind = "TrendsQuery"
      series = [{
        kind        = "EventsNode"
        event       = null
        name        = "All events"
        custom_name = "Crashed sessions %"
        math        = "hogql"
        math_hogql  = "if(uniq($session_id) < ${var.crash_alert_min_sessions}, 0, round(100 * uniqIf($session_id, ${local.fatal_exception}) / uniq($session_id), 2))"
      }]
      interval  = "day"
      dateRange = { date_from = "-30d" }
      properties = concat(local.mobile_filter, var.crash_alert_app_version == null ? [] : [{
        type     = "event"
        key      = "$app_version"
        operator = "exact"
        value    = [var.crash_alert_app_version]
      }])
      trendsFilter = { display = "ActionsLineGraph" }
    }
  })
  dashboard_ids = [posthog_dashboard.mobile_release_health.id]
  tags          = ["mobile", "release-health"]
}

resource "posthog_alert" "crashed_sessions" {
  name    = "Mobile crash-free sessions below ${var.crash_free_sessions_alert_percent}%"
  insight = posthog_insight.crashed_sessions_alert.id

  series_index   = 0
  condition_type = "absolute_value"
  threshold_type = "absolute"
  # Crash-free below X% is the same as crashed above 100 - X%.
  threshold_upper = 100 - var.crash_free_sessions_alert_percent

  # Completed days only: a morning's handful of sessions is not a day.
  calculation_interval   = "daily"
  check_ongoing_interval = false

  subscribed_users = var.release_health_alert_user_ids
}

# Authoritative over the dashboard's tiles: the definitions first, then the
# tables, then the charts. Insights added to the dashboard by hand lose their
# position on the next apply.
resource "posthog_dashboard_layout" "mobile_release_health" {
  dashboard_id = posthog_dashboard.mobile_release_health.id

  tiles = [
    {
      text_body    = file("${path.module}/release_health_definitions.md")
      layouts_json = jsonencode({ sm = { x = 0, y = 0, w = 12, h = 4 } })
    },
    {
      insight_id   = posthog_insight.crash_free_by_version.id
      layouts_json = jsonencode({ sm = { x = 0, y = 4, w = 12, h = 5 } })
    },
    {
      insight_id   = posthog_insight.crash_free_by_release.id
      layouts_json = jsonencode({ sm = { x = 0, y = 9, w = 12, h = 5 } })
    },
    {
      insight_id   = posthog_insight.crash_free_sessions_daily.id
      layouts_json = jsonencode({ sm = { x = 0, y = 14, w = 6, h = 5 } })
    },
    {
      insight_id   = posthog_insight.crashed_sessions_alert.id
      layouts_json = jsonencode({ sm = { x = 6, y = 14, w = 6, h = 5 } })
    },
    {
      insight_id   = posthog_insight.top_exceptions.id
      layouts_json = jsonencode({ sm = { x = 0, y = 19, w = 12, h = 6 } })
    },
  ]
}
