variable "vercel_api_token" {
  description = "Vercel access token scoped to the team that owns the web project. Supply as TF_VAR_vercel_api_token; never put it in terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "team_id" {
  description = "Vercel team ID (team_...): the VERCEL_ORG_ID repo secret."
  type        = string
}

variable "project_id" {
  description = "ID of the existing web project (prj_...): the VERCEL_WEB_PROJECT_ID repo secret. Imported, not created."
  type        = string
}

variable "project_name" {
  description = "The project's name, exactly as Vercel shows it. A different value renames the project on apply."
  type        = string
}

variable "state_bucket" {
  description = "GCS bucket holding every root's state, the same one passed to `terraform init -backend-config`. Read here for infra/posthog's outputs."
  type        = string
}

variable "production_domain" {
  description = "The domain the web app is served on. Must stay on the same site as the API's domain, or the auth cookies stop working (root CLAUDE.md, Auth)."
  type        = string
  default     = "www.trakwyn.com"
}

variable "apex_domain" {
  description = "Bare domain that redirects to production_domain, if the project has one. null when it does not, since an import of a domain the project lacks fails."
  type        = string
  default     = "trakwyn.com"
  nullable    = true
}

variable "api_url" {
  description = "The API's GraphQL endpoint, baked into the bundle as VITE_API_URL. Its host is infra/gcp's api_domain."
  type        = string
  default     = "https://api.trakwyn.com/graphql"
}

variable "posthog_host" {
  description = "PostHog ingestion host, baked into the bundle as VITE_POSTHOG_HOST. The EU cloud; matches POSTHOG_EU_HOST in apps/web/src/constants.ts."
  type        = string
  default     = "https://eu.i.posthog.com"
}

variable "env_var_import_ids" {
  description = "One-time bootstrap: IDs of env vars that already exist on the project, keyed by name (e.g. { VITE_API_URL = \"AbC123\" }), so apply adopts them instead of failing on a duplicate. Leave {} once they are in state. See README.md for how to list them."
  type        = map(string)
  default     = {}
}
