variable "neon_api_key" {
  description = "Neon API key with access to the production project. Supply as TF_VAR_neon_api_key; never put it in terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "project_id" {
  description = "ID of the existing production project (e.g. shiny-cell-31746257), from Settings > General. Not managed here, only referenced (README.md, \"Why there is no neon_project\")."
  type        = string
}

variable "branch_id" {
  description = "ID of the project's default branch (br-...), the one the API and migrations connect to. Imported, not created."
  type        = string
}

variable "endpoint_id" {
  description = "ID of that branch's read-write compute (ep-...). Its host is in both connection strings. Imported, not created."
  type        = string
}

variable "branch_name" {
  description = "The default branch's name, exactly as Neon shows it. A different value renames the branch on apply."
  type        = string
  default     = "main"
}

variable "database_name" {
  description = "The database the API uses: the path in the database-url secret. Imported, not created."
  type        = string
  default     = "neondb"
}

variable "database_owner" {
  description = "The role that owns database_name: the user in the database-url secret. The role itself is not managed here."
  type        = string
  default     = "neondb_owner"
}

variable "region" {
  description = "The region the compute must be in. Checked, not set: a project's region is fixed when it is created. Matches infra/gcp/README.md and apps/api/CLAUDE.md."
  type        = string
  default     = "aws-eu-central-1"
}

variable "protect_branch" {
  description = "Mark the default branch protected, so it cannot be deleted or reset from the console. Protected branches need a paid Neon plan; set false on the Free plan."
  type        = bool
  default     = true
}
