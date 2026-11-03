variable "project_id" {
  description = "GCP project that hosts the API."
  type        = string
}

variable "region" {
  description = "Tier 1 Cloud Run region that supports domain mappings; europe-west1 is the cheapest close to London (see JEF-335)."
  type        = string
  default     = "europe-west1"
}

variable "github_repository" {
  description = "owner/name of the only GitHub repository allowed to deploy through Workload Identity Federation."
  type        = string
  default     = "mankatcheung/trakwyn"
}

variable "initial_image" {
  description = "Image the service is created with. Only read on the first apply: CI owns the image afterwards, and Terraform ignores changes to it."
  type        = string
}

variable "api_domain" {
  description = "Custom domain mapped to the service. Must be verified for the Terraform caller's account in Google Search Console."
  type        = string
  default     = "api.trakwyn.com"
}

variable "web_app_origin" {
  description = "The web app's exact public origin: CORS_ORIGIN and WEB_APP_ORIGIN."
  type        = string
  default     = "https://www.trakwyn.com"
}

variable "cookie_domain" {
  description = "Shared cookie Domain attribute for www/api: COOKIE_DOMAIN."
  type        = string
  default     = ".trakwyn.com"
}

variable "min_instances" {
  description = "0 scales to zero (cold starts, ~$1-2/month); 1 keeps one instance warm (~$12/month)."
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Upper bound on instances, a cost cap as much as a capacity limit."
  type        = number
  default     = 3
}

variable "upstash_redis_rest_url" {
  description = "Upstash Redis REST URL, copied from infra/upstash's rest_url output. Its token is a secret."
  type        = string
}

variable "plain_env" {
  description = "Non-secret environment variables that vary by install (OAuth client IDs, extension OAuth IDs, VAPID public key, email sender, Axiom datasets)."
  type        = map(string)
  default     = {}
}

variable "hosted_ai" {
  description = "Turn on hosted AI (Trakwyn AI, JEF-446): sets HOSTED_AI_ENABLED and serves the platform's provider keys and gateway token from Secret Manager. Each of the three secrets needs a version before the apply, or Cloud Run refuses to start the revision (README.md, 'Hosted AI'). Off by default; set false again as the kill switch."
  type        = bool
  default     = false
}

variable "hosted_ai_rollout_percent" {
  description = "Share of users (0-100) who get hosted AI while hosted_ai is true (JEF-453), by a stable hash of the user id. 0 by default so turning hosted_ai on reaches nobody but the allowlist; raise it per rollout stage (README.md, 'Hosted AI rollout'). Set 0 to roll back without a gateway change."
  type        = number
  default     = 0

  validation {
    condition     = var.hosted_ai_rollout_percent >= 0 && var.hosted_ai_rollout_percent <= 100
    error_message = "hosted_ai_rollout_percent must be between 0 and 100."
  }
}

variable "hosted_ai_allowlist" {
  description = "User ids who get hosted AI whatever the rollout percentage (JEF-453): the staff-only stage. Ids are not secrets."
  type        = list(string)
  default     = []
}

variable "secret_env_vars" {
  description = "Environment variables served from Secret Manager. Each needs a secret version before the service can start; drop a name to leave that feature unconfigured."
  type        = set(string)
  default = [
    "JWT_SECRET",
    "JWT_REFRESH_SECRET",
    "TOTP_ENCRYPTION_KEY",
    "LLM_API_KEY_ENCRYPTION_KEY",
    "DATABASE_URL",
    "UPSTASH_REDIS_REST_TOKEN",
    "BLOB_PUBLIC_READ_WRITE_TOKEN",
    "BLOB_PRIVATE_READ_WRITE_TOKEN",
    "BREVO_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "POLAR_ACCESS_TOKEN",
    "POLAR_WEBHOOK_SECRET",
    "CRON_SECRET",
    "DIGEST_ADMIN_SECRET",
    "GOOGLE_OAUTH_CLIENT_SECRET",
    "GITHUB_OAUTH_CLIENT_SECRET",
    "VAPID_PRIVATE_KEY",
    "AXIOM_TOKEN",
  ]

  # A Postgres connection string carries its password, so it is a secret
  # (JEF-342) — unlike the old Turso URL, whose credential was a separate
  # auth token.
  validation {
    condition     = contains(var.secret_env_vars, "DATABASE_URL")
    error_message = "DATABASE_URL is required: it is the Neon connection string, password included."
  }
}
