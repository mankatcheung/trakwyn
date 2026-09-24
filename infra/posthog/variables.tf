variable "posthog_api_key" {
  description = "PostHog personal API key with project read/write scope. Supply as TF_VAR_posthog_api_key; never put it in terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "posthog_host" {
  description = "PostHog's management API for the EU cloud. Not the ingestion host (eu.i.posthog.com) the clients send events to."
  type        = string
  default     = "https://eu.posthog.com"
}

variable "organization_id" {
  description = "UUID of the PostHog organization that owns the project (Settings -> Organization)."
  type        = string
}

variable "project_id" {
  description = "Numeric ID of the existing PostHog project the web and mobile apps report to (Settings -> Project). Imported, not created."
  type        = string
}

variable "project_name" {
  description = "The project's name, exactly as PostHog shows it. A different value renames the project on apply."
  type        = string
}
