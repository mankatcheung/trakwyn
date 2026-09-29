variable "upstash_email" {
  description = "Email of the Upstash account that owns the database. Supply as TF_VAR_upstash_email."
  type        = string
}

variable "upstash_api_key" {
  description = "Upstash management API key (Account → Management API). Account-wide; supply as TF_VAR_upstash_api_key, never in terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "database_name" {
  description = "Name of the production database, as the Upstash console shows it. Not secret."
  type        = string
}

variable "region" {
  description = "The database's region exactly as the Upstash API reports it: \"global\" for a global database, otherwise a legacy regional value such as \"eu-west-1\". Changing it replaces the database, which prevent_destroy refuses."
  type        = string
}

variable "primary_region" {
  description = "Primary region of a global database (e.g. \"eu-west-1\"). Null for a regional one."
  type        = string
  default     = null

  validation {
    condition     = (var.region == "global") == (var.primary_region != null)
    error_message = "Set primary_region exactly when region is \"global\"."
  }
}

variable "read_regions" {
  description = "Read replica regions of a global database, excluding primary_region. Empty for none."
  type        = set(string)
  default     = []

  validation {
    condition     = length(var.read_regions) == 0 || var.region == "global"
    error_message = "read_regions only applies when region is \"global\"."
  }
}

variable "database_import_id" {
  description = "One-time bootstrap: the live database's database_id, so apply adopts it instead of creating a second one. Set it back to null once it is in state. See README.md for how to list it."
  type        = string
  default     = null
}
