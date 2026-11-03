variable "axiom_api_token" {
  description = "Axiom API token with permission to manage monitors and notifiers. Supply as TF_VAR_axiom_api_token; never put it in terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "dataset" {
  description = "Traces dataset: the API's AXIOM_DATASET. Logs moved to logs_dataset in JEF-373."
  type        = string
}

variable "logs_dataset" {
  description = "Logs dataset: the API's AXIOM_LOGS_DATASET (JEF-373). Every log-based monitor reads it."
  type        = string
}

variable "metrics_dataset" {
  description = "Metrics dataset: the API's AXIOM_METRICS_DATASET."
  type        = string
}

variable "alert_emails" {
  description = "Addresses the one email notifier sends every alert to."
  type        = list(string)

  validation {
    condition     = length(var.alert_emails) > 0
    error_message = "At least one alert email is required, or no monitor tells anyone anything."
  }
}

# The two thresholds below are starting points, not measurements (JEF-355):
# they need about a week of production traffic to set properly. Both start
# loose so the first week produces a baseline rather than noise.

variable "db_pool_errors_per_hour" {
  description = "Alert when Postgres idle-client pool errors in an hour exceed this. Some are routine: Neon closes idle sockets when it scales to zero."
  type        = number
  default     = 20
}

variable "graphql_error_percent" {
  description = "Alert when the share of POST /graphql root spans marked ERROR over 15 minutes exceeds this percentage."
  type        = number
  default     = 5
}

variable "graphql_error_min_requests" {
  description = "Below this many requests in the 15-minute window the error rate is reported as 0, so one failure at night is not 100%."
  type        = number
  default     = 20
}

variable "hosted_ai_hourly_cost_usd" {
  description = "Alert when the platform's LLM spend (source = platform) in a rolling hour exceeds this many USD (JEF-449). The daily breaker is $10, so $3 an hour is well above normal and well below the cap."
  type        = number
  default     = 3
}

variable "hosted_ai_failover_per_hour" {
  description = "Alert when more than this many platform calls failed over to the second provider in an hour (JEF-449)."
  type        = number
  default     = 20
}

variable "ai_credits_exhausted_per_hour" {
  description = "Alert when more than this many requests are refused with AI_CREDITS_EXHAUSTED in an hour (JEF-449): a spike means a pricing or abuse problem, not one user running out."
  type        = number
  default     = 50
}
