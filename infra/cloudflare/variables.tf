variable "cloudflare_api_token" {
  description = "Cloudflare API token scoped to the trakwyn.com zone (Zone Read, DNS Edit, Zone Settings Edit). Supply as TF_VAR_cloudflare_api_token; never put it in terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "zone_id" {
  description = "ID of the trakwyn.com zone, from the zone's Overview page in the dashboard. Not secret."
  type        = string
}

variable "record_import_ids" {
  description = "One-time bootstrap: Cloudflare IDs of records that already exist in the zone, keyed as in local.records (e.g. { www = \"023e105f...\" }), so apply adopts them instead of creating duplicates. Leave {} once they are in state. See README.md for how to list them."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for key in keys(var.record_import_ids) : contains(keys(local.records), key)])
    error_message = "Every key in record_import_ids must be a key of local.records in dns.tf."
  }
}

variable "email_routing_rules" {
  description = "Email Routing forwarding rules, keyed by the rule's name as the dashboard shows it (e.g. { hello = { address = \"hello@trakwyn.com\", forward_to = \"me@example.com\" } }). forward_to must already be a verified destination address."
  type = map(object({
    address    = string
    forward_to = string
  }))
  default = {}

  validation {
    condition     = alltrue([for rule in values(var.email_routing_rules) : endswith(rule.address, "@trakwyn.com")])
    error_message = "Every rule's address must be on trakwyn.com."
  }
}

variable "email_routing_rule_import_ids" {
  description = "One-time bootstrap: Cloudflare IDs of rules that already exist, keyed as in email_routing_rules. Leave {} once they are in state. See README.md for how to list them."
  type        = map(string)
  default     = {}

  validation {
    condition     = alltrue([for key in keys(var.email_routing_rule_import_ids) : contains(keys(var.email_routing_rules), key)])
    error_message = "Every key in email_routing_rule_import_ids must be a key of email_routing_rules."
  }
}
