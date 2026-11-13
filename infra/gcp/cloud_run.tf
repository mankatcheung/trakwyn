locals {
  # The Cloudflare API token hosted AI calls Workers AI with, through AI Gateway
  # (JEF-453). Hosted AI uses no Google or OpenAI key. The account id and gateway
  # id are not secret: they go in plain_env (PLATFORM_CLOUDFLARE_ACCOUNT_ID,
  # PLATFORM_CLOUDFLARE_GATEWAY_ID). The value is added out of band, like every
  # secret here; it is never in state.
  hosted_ai_secret_env_vars = [
    "PLATFORM_CLOUDFLARE_API_TOKEN",
  ]
  # The key web search in company briefings calls Tavily with (JEF-538). Like
  # the hosted AI token it is added out of band and never enters state.
  web_search_secret_env_vars = [
    "TAVILY_API_KEY",
  ]
  secret_env_vars = setunion(
    var.secret_env_vars,
    var.hosted_ai ? local.hosted_ai_secret_env_vars : [],
    var.web_search ? local.web_search_secret_env_vars : [],
  )

  # Config that is the same for every install, plus the per-install values
  # from variables. PORT is deliberately absent: Cloud Run reserves it and
  # injects 8080.
  plain_env = merge(
    {
      NODE_ENV               = "production"
      API_ORIGIN             = "https://${var.api_domain}"
      WEB_APP_ORIGIN         = var.web_app_origin
      CORS_ORIGIN            = var.web_app_origin
      COOKIE_DOMAIN          = var.cookie_domain
      CACHE_PROVIDER         = "redis"
      UPSTASH_REDIS_REST_URL = var.upstash_redis_rest_url
      STORAGE_PROVIDER       = "vercel-blob"
      EMAIL_PROVIDER         = "brevo"
      # Whose OIDC tokens the admin cron routes accept (scheduler.tf).
      CRON_INVOKER_SA = google_service_account.cron_invoker.email
      # AI usage analytics (JEF-566). The key is public, so it is not a secret.
      # Unset it here to switch the adapter back to a no-op.
      POSTHOG_API_KEY = data.terraform_remote_state.posthog.outputs.project_api_key
      POSTHOG_HOST    = var.posthog_host
    },
    var.hosted_ai ? {
      HOSTED_AI_ENABLED         = "true"
      HOSTED_AI_ROLLOUT_PERCENT = tostring(var.hosted_ai_rollout_percent)
      HOSTED_AI_ALLOWLIST       = join(",", var.hosted_ai_allowlist)
    } : {},
    var.web_search ? { SEARCH_PROVIDER = "tavily" } : {},
    var.plain_env,
  )
}

resource "google_cloud_run_v2_service" "api" {
  name     = "trakwyn-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.api_runtime.email
    # Long enough for a chat SSE stream (chatStream.routes.ts) and the admin
    # cron routes, which make a full pass over users.
    timeout                          = "600s"
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.initial_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
        # Request-based billing: CPU is only allocated while a request is in
        # flight. The API flushes telemetry before each response completes
        # (buildApp.ts) for exactly this reason.
        cpu_idle          = true
        startup_cpu_boost = true
      }

      # No liveness probe: with request-based billing an idle instance has no
      # CPU to answer one, and a crashed Node process exits the container
      # anyway.
      startup_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 2
        timeout_seconds   = 2
        failure_threshold = 30
      }

      dynamic "env" {
        for_each = local.plain_env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = google_secret_manager_secret.api
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret_id
              version = "latest"
            }
          }
        }
      }
    }
  }

  lifecycle {
    # CI's deploy-api job rolls out every image after the first; without this
    # Terraform would revert each deploy to initial_image.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }

  depends_on = [
    google_project_service.enabled,
    google_secret_manager_secret_iam_member.api_runtime,
  ]
}

# A public API: authentication happens in the application (cookies, API
# tokens), not at Cloud Run's IAM layer.
resource "google_cloud_run_v2_service_iam_member" "public" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Keeps api.<domain> on the same site as www.<domain>, which the auth cookies
# depend on (COOKIE_DOMAIN). A Preview feature; the GA alternative is a global
# external Application Load Balancer (~$18/month more).
resource "google_cloud_run_domain_mapping" "api" {
  location = var.region
  name     = var.api_domain

  metadata {
    namespace = var.project_id
  }

  spec {
    route_name = google_cloud_run_v2_service.api.name
  }
}
