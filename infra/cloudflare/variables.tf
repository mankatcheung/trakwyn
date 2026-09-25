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
