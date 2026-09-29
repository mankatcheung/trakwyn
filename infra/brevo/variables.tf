variable "brevo_api_key" {
  description = "Brevo API key used only by Terraform, separate from the API's runtime BREVO_API_KEY (README.md). Supply as TF_VAR_brevo_api_key; never put it in terraform.tfvars."
  type        = string
  sensitive   = true
}

variable "sender_import_id" {
  description = "One-time bootstrap: Brevo's numeric ID of the existing noreply@trakwyn.com sender, so apply adopts it instead of creating a duplicate. Leave null once it is in state. See README.md for how to look it up."
  type        = string
  default     = null
}
