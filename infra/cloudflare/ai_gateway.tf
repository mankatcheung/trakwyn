# The AI gateway behind hosted AI (Hosted AI 3, JEF-446). The API sends the
# platform's Gemini and OpenAI calls through it for analytics, an edge rate
# limit and a kill switch. Account-level, like the Turnstile widget, so the
# token needs Account · AI Gateway · Edit (README.md).
#
# Deliberately restrictive:
#
# - Authenticated: a call without `cf-aig-authorization` is refused, so the
#   gateway URL alone cannot be used to spend the platform's provider keys.
#   The token is created in the dashboard and goes to Secret Manager
#   (`platform-llm-gateway-token`); Terraform never sees it.
# - Logging off: prompts and replies hold resumes and notes. Axiom already
#   carries token and cost metrics.
# - Cache off: responses hold personal data and the gateway's cache key is not
#   user-scoped. Caching, if any, is the app's job (Hosted AI 7).
# - Rate limit: a backstop for a runaway caller, not the per-user limit, which
#   the API enforces itself.
resource "cloudflare_ai_gateway" "hosted_ai" {
  account_id = var.account_id
  id         = var.ai_gateway_id

  authentication = true

  collect_logs               = false
  cache_ttl                  = 0
  cache_invalidate_on_update = false

  rate_limiting_interval  = var.ai_gateway_rate_limit_interval_s
  rate_limiting_limit     = var.ai_gateway_rate_limit
  rate_limiting_technique = "sliding"
}
