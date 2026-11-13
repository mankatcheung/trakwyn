# AI features (JEF-570): what the AI actions cost, how fast they are, how
# often they fail and whether people like the output, from the events the API
# sends to PostHog (JEF-566 to JEF-569): `$ai_generation`, `$ai_span`,
# `$ai_feedback` and `ai_output_rating_cleared`. Definitions are in
# ai_features_definitions.md, the dashboard's first tile.
#
# Every property named here is sent by apps/api/src/infrastructure/analytics/
# PostHogAiAnalytics.ts. Renaming one there means editing this file and
# queries/ai_*.sql in the same PR (see infrastructure/observability/CLAUDE.md).
# Spend, breaker, circuit and failover alerting stays in infra/axiom.
#
# Apply only once the events have flowed for a few days: a query on a
# property PostHog has never seen can be rejected.
#
# Everything but the daily cost chart is HogQL in queries/, so it can be
# pasted into the SQL editor as it is. The two alerts are SQL alerts
# (`evaluation = "any_row"`): a row per feature, and the alert fires if any
# row is over the limit, which is what "on any feature" needs and what a
# trends alert (one series at a time) cannot do.

resource "posthog_dashboard" "ai_features" {
  name        = "AI features"
  description = "Cost, latency, errors, ratings and tool calls of the AI features (JEF-570). Managed in infra/posthog; edits made here are reverted on the next apply."
  tags        = ["ai", "terraform"]
}

resource "posthog_insight" "ai_cost_daily" {
  name        = "AI cost a day by feature and source (USD, 30 days)"
  description = "Sum of $ai_total_cost_usd. source is platform (Trakwyn AI) or byok (the user's own key; priced for comparison, not paid by Trakwyn)."
  query_json = jsonencode({
    kind = "InsightVizNode"
    source = {
      kind = "TrendsQuery"
      series = [{
        kind               = "EventsNode"
        event              = "$ai_generation"
        name               = "$ai_generation"
        custom_name        = "Cost (USD)"
        math               = "sum"
        math_property      = "$ai_total_cost_usd"
        math_property_type = "event_properties"
      }]
      interval  = "day"
      dateRange = { date_from = "-30d" }
      breakdownFilter = {
        breakdowns = [
          { property = "feature", type = "event" },
          { property = "source", type = "event" },
        ]
      }
      trendsFilter = { display = "ActionsBar" }
    }
  })
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_insight" "ai_cost_per_user_by_tier" {
  name          = "AI cost per user by hosted tier: p50, p95 (30 days)"
  description   = "The API sends the hosted model tier, not the billing plan, so this is the closest split there is. Calls on a user's own key have no tier."
  query_sql     = file("${path.module}/queries/ai_cost_per_user_by_tier.sql")
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_insight" "ai_top_spenders" {
  name          = "Top 10 users by AI cost (pseudonymous ids, 30 days)"
  description   = "The hash is the gateway's `user` value, never a Trakwyn id."
  query_sql     = file("${path.module}/queries/ai_top_spenders.sql")
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_insight" "ai_latency" {
  name          = "AI latency by feature and model: p50, p95, p95 time to first token (7 days)"
  description   = "Successful calls only, in seconds. Time to first token is sent by streams only."
  query_sql     = file("${path.module}/queries/ai_latency.sql")
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_insight" "ai_error_share" {
  name          = "AI errors by feature, source and error kind (7 days)"
  description   = "Calls that ended in an error. Aborted calls are not errors."
  query_sql     = file("${path.module}/queries/ai_error_share.sql")
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_insight" "ai_downvote_share" {
  name          = "Down-vote share by feature, model and prompt version (7 days)"
  description   = "Net of ratings taken back. Small samples swing: read it with the ratings column."
  query_sql     = file("${path.module}/queries/ai_downvote_share.sql")
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_insight" "ai_downvote_reasons" {
  name          = "Down-vote reasons by feature (30 days)"
  description   = "The reason picked with a down-vote, net of ratings taken back."
  query_sql     = file("${path.module}/queries/ai_downvote_reasons.sql")
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_insight" "ai_tool_calls" {
  name          = "Tool calls by tool and outcome (7 days)"
  description   = "From the $ai_span events of MCP and chat tool calls. ok, domain_error, refused and internal_error are the tool's own outcomes."
  query_sql     = file("${path.module}/queries/ai_tool_calls.sql")
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

# What the two alerts read. Each is also on the dashboard, so the number that
# fired is the one on screen. Below the minimum the share reads 0, the guard
# infra/axiom's graphql_error_min_requests and the crash alert use.
resource "posthog_insight" "ai_downvote_alert" {
  name          = "Down-vote share per feature, 7 days (alert)"
  description   = "Reads 0 for a feature with fewer than ${var.ai_downvote_alert_min_ratings} ratings in the 7 days."
  query_sql     = templatefile("${path.module}/queries/ai_downvote_alert.sql", { min_ratings = var.ai_downvote_alert_min_ratings })
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_insight" "ai_byok_error_alert" {
  name          = "Own-key error share per feature, last 24 hours (alert)"
  description   = "Reads 0 for a feature with fewer than ${var.ai_byok_error_alert_min_calls} own-key calls in the 24 hours."
  query_sql     = templatefile("${path.module}/queries/ai_byok_error_alert.sql", { min_calls = var.ai_byok_error_alert_min_calls })
  dashboard_ids = [posthog_dashboard.ai_features.id]
  tags          = ["ai", "ai-features"]
}

resource "posthog_alert" "ai_downvote_share" {
  name    = "AI down-vote share above ${var.ai_downvote_alert_percent}% on a feature (7 days)"
  insight = posthog_insight.ai_downvote_alert.id

  evaluation      = "any_row"
  column          = "downvote_share_pct"
  label_column    = "feature"
  condition_type  = "absolute_value"
  threshold_type  = "absolute"
  threshold_upper = var.ai_downvote_alert_percent

  calculation_interval = "daily"

  subscribed_users = var.release_health_alert_user_ids
}

resource "posthog_alert" "ai_byok_error_share" {
  name    = "AI own-key error share above ${var.ai_byok_error_alert_percent}% on a feature (24 hours)"
  insight = posthog_insight.ai_byok_error_alert.id

  evaluation      = "any_row"
  column          = "error_share_pct"
  label_column    = "feature"
  condition_type  = "absolute_value"
  threshold_type  = "absolute"
  threshold_upper = var.ai_byok_error_alert_percent

  calculation_interval = "hourly"

  subscribed_users = var.release_health_alert_user_ids
}

# Authoritative over the dashboard's tiles: definitions, then cost, then
# latency and errors, ratings, tools, and the two alert views last. Insights
# added by hand lose their position on the next apply.
resource "posthog_dashboard_layout" "ai_features" {
  dashboard_id = posthog_dashboard.ai_features.id

  tiles = [
    {
      # Trimmed: see release_health.tf for why the provider needs that.
      text_body    = trimspace(file("${path.module}/ai_features_definitions.md"))
      layouts_json = jsonencode({ sm = { x = 0, y = 0, w = 12, h = 4 } })
    },
    {
      insight_id   = posthog_insight.ai_cost_daily.id
      layouts_json = jsonencode({ sm = { x = 0, y = 4, w = 12, h = 5 } })
    },
    {
      insight_id   = posthog_insight.ai_cost_per_user_by_tier.id
      layouts_json = jsonencode({ sm = { x = 0, y = 9, w = 6, h = 5 } })
    },
    {
      insight_id   = posthog_insight.ai_top_spenders.id
      layouts_json = jsonencode({ sm = { x = 6, y = 9, w = 6, h = 5 } })
    },
    {
      insight_id   = posthog_insight.ai_latency.id
      layouts_json = jsonencode({ sm = { x = 0, y = 14, w = 12, h = 5 } })
    },
    {
      insight_id   = posthog_insight.ai_error_share.id
      layouts_json = jsonencode({ sm = { x = 0, y = 19, w = 12, h = 5 } })
    },
    {
      insight_id   = posthog_insight.ai_downvote_share.id
      layouts_json = jsonencode({ sm = { x = 0, y = 24, w = 12, h = 5 } })
    },
    {
      insight_id   = posthog_insight.ai_downvote_reasons.id
      layouts_json = jsonencode({ sm = { x = 0, y = 29, w = 6, h = 5 } })
    },
    {
      insight_id   = posthog_insight.ai_tool_calls.id
      layouts_json = jsonencode({ sm = { x = 6, y = 29, w = 6, h = 5 } })
    },
    {
      insight_id   = posthog_insight.ai_downvote_alert.id
      layouts_json = jsonencode({ sm = { x = 0, y = 34, w = 6, h = 4 } })
    },
    {
      insight_id   = posthog_insight.ai_byok_error_alert.id
      layouts_json = jsonencode({ sm = { x = 6, y = 34, w = 6, h = 4 } })
    },
  ]
}
