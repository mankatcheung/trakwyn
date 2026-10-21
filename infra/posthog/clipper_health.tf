# Clipper health (JEF-417): the browser extension's faults per board and per
# release, and an alert when a job board's page stops parsing.
#
# A store release cannot be rolled back, only replaced, and installed copies
# stay on an old version for days, so what is broken in the field has to be
# visible by `release` (the extension's manifest version) and by board.
#
# Everything here reads the events `apps/extension/src/lib/observability`
# sends: `parser_result`, `graphql_request_failed`, `token_refresh_failed` and
# `oauth_login_failed`. They are operational reports with no person, so these
# are counts of faults, never of users or clips: PostHog cannot say what share
# of clips failed, only how many reports arrived. The alert is therefore an
# absolute count per day, not a rate.

locals {
  # The extension's $lib (OBSERVABILITY.LIB). Web and mobile send to the same
  # project, so every Clipper query filters on this.
  clipper_filter = [{
    type     = "event"
    key      = "$lib"
    operator = "exact"
    value    = ["trakwyn-extension"]
  }]

  # JOB_BOARDS in apps/extension/src/constants.ts, one id per board
  # (myworkdayjobs.com and workday.com are both "workday"). A new board there
  # needs a line here, or its failures show only under "other".
  clipper_boards = ["linkedin", "indeed", "glassdoor", "greenhouse", "lever", "workday"]

  clipper_fault_events = ["graphql_request_failed", "token_refresh_failed", "oauth_login_failed"]
}

resource "posthog_dashboard" "clipper_health" {
  name        = "Clipper health"
  description = "Browser extension faults by job board and by release (JEF-417). Managed in infra/posthog; edits made here are reverted on the next apply."
  tags        = ["extension", "terraform"]
}

# One line per board, which is also what lets an alert watch a single board:
# alerts take a series, not a breakdown value.
resource "posthog_insight" "clipper_parser_by_board" {
  name        = "Parser results by job board, daily"
  description = "A known job board's page gave the parsers less than a clip needs. A rise on one line means that site changed its markup. Boards with no URL check (Glassdoor, Greenhouse, Lever, Workday) report a few from non-job pages as normal."
  query_json = jsonencode({
    kind = "InsightVizNode"
    source = {
      kind = "TrendsQuery"
      series = [for board in local.clipper_boards : {
        kind        = "EventsNode"
        event       = "parser_result"
        name        = "parser_result"
        custom_name = board
        math        = "total"
        properties = [{
          type     = "event"
          key      = "board"
          operator = "exact"
          value    = [board]
        }]
      }]
      interval     = "day"
      dateRange    = { date_from = "-30d" }
      properties   = local.clipper_filter
      trendsFilter = { display = "ActionsLineGraph" }
    }
  })
  dashboard_ids = [posthog_dashboard.clipper_health.id]
  tags          = ["extension", "clipper-health"]
}

resource "posthog_insight" "clipper_parser_by_release" {
  name        = "Parser results by Clipper release, daily"
  description = "The same events split by the extension's version, to see whether a release fixed a board or broke one."
  query_json = jsonencode({
    kind = "InsightVizNode"
    source = {
      kind = "TrendsQuery"
      series = [{
        kind        = "EventsNode"
        event       = "parser_result"
        name        = "parser_result"
        custom_name = "Parser results"
        math        = "total"
      }]
      interval        = "day"
      dateRange       = { date_from = "-30d" }
      properties      = local.clipper_filter
      breakdownFilter = { breakdown = "release", breakdown_type = "event" }
      trendsFilter    = { display = "ActionsLineGraph" }
    }
  })
  dashboard_ids = [posthog_dashboard.clipper_health.id]
  tags          = ["extension", "clipper-health"]
}

resource "posthog_insight" "clipper_faults_by_release" {
  name        = "API, token refresh and sign-in failures by Clipper release, daily"
  description = "graphql_request_failed (the API unreachable or 5xx), token_refresh_failed (the user was signed out) and oauth_login_failed (a Google or GitHub sign-in ended in an error; a cancel is not one), split by the extension's version."
  query_json = jsonencode({
    kind = "InsightVizNode"
    source = {
      kind = "TrendsQuery"
      series = [for event in local.clipper_fault_events : {
        kind        = "EventsNode"
        event       = event
        name        = event
        custom_name = event
        math        = "total"
      }]
      interval        = "day"
      dateRange       = { date_from = "-30d" }
      properties      = local.clipper_filter
      breakdownFilter = { breakdown = "release", breakdown_type = "event" }
      trendsFilter    = { display = "ActionsLineGraph" }
    }
  })
  dashboard_ids = [posthog_dashboard.clipper_health.id]
  tags          = ["extension", "clipper-health"]
}

# One alert per board, because PostHog alerts watch one series. The count is
# the previous complete day's, so a morning's handful is not a day. Ten is a
# starting point: there is no store traffic yet to set it from.
#
# Only the boards in var.clipper_alert_boards get one: PostHog's plan allows 5
# alerts in the project, and the mobile crash alert already uses one. Every
# board stays on the chart above whether or not it has an alert.
resource "posthog_alert" "clipper_parser_spike" {
  for_each = { for index, board in local.clipper_boards : board => index if contains(var.clipper_alert_boards, board) }

  name    = "Clipper: ${each.key} parser results above ${var.clipper_parser_alert_daily} a day"
  insight = posthog_insight.clipper_parser_by_board.id

  series_index    = each.value
  condition_type  = "absolute_value"
  threshold_type  = "absolute"
  threshold_upper = var.clipper_parser_alert_daily

  calculation_interval   = "daily"
  check_ongoing_interval = false

  subscribed_users = var.release_health_alert_user_ids
}

resource "posthog_dashboard_layout" "clipper_health" {
  dashboard_id = posthog_dashboard.clipper_health.id

  tiles = [
    {
      # Trimmed for the reason given in release_health.tf.
      text_body    = trimspace(file("${path.module}/clipper_health_definitions.md"))
      layouts_json = jsonencode({ sm = { x = 0, y = 0, w = 12, h = 4 } })
    },
    {
      insight_id   = posthog_insight.clipper_parser_by_board.id
      layouts_json = jsonencode({ sm = { x = 0, y = 4, w = 12, h = 6 } })
    },
    {
      insight_id   = posthog_insight.clipper_parser_by_release.id
      layouts_json = jsonencode({ sm = { x = 0, y = 10, w = 6, h = 5 } })
    },
    {
      insight_id   = posthog_insight.clipper_faults_by_release.id
      layouts_json = jsonencode({ sm = { x = 6, y = 10, w = 6, h = 5 } })
    },
  ]
}
