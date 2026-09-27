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

# Mobile release health (JEF-368). The threshold and the minimum are starting
# points: the app has no real release stream until EAS builds exist
# (JEF-300), so there is no baseline to set them from yet.

variable "release_health_alert_user_ids" {
  description = "Numeric PostHog user IDs the crash-free-sessions alert notifies. Not the UUID: see README.md for how to find it."
  type        = list(number)

  validation {
    condition     = length(var.release_health_alert_user_ids) > 0
    error_message = "At least one user is required, or the alert tells nobody anything."
  }
}

variable "crash_free_sessions_alert_percent" {
  description = "Alert when a day's crash-free mobile sessions fall below this percentage."
  type        = number
  default     = 99

  validation {
    condition     = var.crash_free_sessions_alert_percent > 0 && var.crash_free_sessions_alert_percent < 100
    error_message = "Must be between 0 and 100, exclusive."
  }
}

variable "crash_alert_min_sessions" {
  description = "Below this many mobile sessions in a day the crash rate is reported as 0, so one crash on a quiet day or a day-old build does not alert."
  type        = number
  default     = 50
}

variable "crash_alert_app_version" {
  description = "App version the alert watches, e.g. \"1.2.0\" while it rolls out. Null watches every version together, which is the latest one once most users have updated."
  type        = string
  default     = null
}
