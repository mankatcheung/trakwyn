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

# Clipper health (JEF-417). A starting point: the Clipper has no store traffic
# yet, so there is no baseline to set it from.

variable "clipper_parser_alert_daily" {
  description = "Alert when one job board's parser results (a page the Clipper's parsers could not fully read) exceed this many in a day. A count, not a rate: the Clipper sends no clip events to divide by."
  type        = number
  default     = 10

  validation {
    condition     = var.clipper_parser_alert_daily > 0
    error_message = "Must be above 0, or the alert fires on a quiet day."
  }
}

variable "clipper_alert_boards" {
  description = "Job boards that get a parser-result alert. PostHog's plan allows 5 alerts in the project; the mobile crash alert uses one and the AI features alerts two (JEF-570), so keep this to 2 or fewer or an apply fails with \"reached the limit of 5 alerts\". Every board stays on the dashboard either way. Ids are those of local.clipper_boards."
  type        = list(string)
  default     = ["linkedin", "indeed"]

  validation {
    condition     = length(var.clipper_alert_boards) <= 2
    error_message = "At most 2 boards: the project's 5 alerts are the mobile crash alert, the 2 AI features alerts and these."
  }

  validation {
    condition     = alltrue([for board in var.clipper_alert_boards : contains(["linkedin", "indeed", "glassdoor", "greenhouse", "lever", "workday"], board)])
    error_message = "Each board must be one of linkedin, indeed, glassdoor, greenhouse, lever, workday."
  }
}

# AI features (JEF-570). First guesses: tighten after two weeks of real data.
# The alerts notify release_health_alert_user_ids.

variable "ai_downvote_alert_percent" {
  description = "Alert when a feature's down-vote share of ratings over 7 days exceeds this percentage."
  type        = number
  default     = 30

  validation {
    condition     = var.ai_downvote_alert_percent > 0 && var.ai_downvote_alert_percent < 100
    error_message = "Must be between 0 and 100, exclusive."
  }
}

variable "ai_downvote_alert_min_ratings" {
  description = "Below this many ratings in 7 days a feature's down-vote share is reported as 0, so two down-votes out of five do not alert."
  type        = number
  default     = 20
}

variable "ai_byok_error_alert_percent" {
  description = "Alert when a feature's share of failed calls on the user's own key over 24 hours exceeds this percentage."
  type        = number
  default     = 15

  validation {
    condition     = var.ai_byok_error_alert_percent > 0 && var.ai_byok_error_alert_percent < 100
    error_message = "Must be between 0 and 100, exclusive."
  }
}

variable "ai_byok_error_alert_min_calls" {
  description = "Below this many own-key calls in 24 hours a feature's error share is reported as 0."
  type        = number
  default     = 20
}
