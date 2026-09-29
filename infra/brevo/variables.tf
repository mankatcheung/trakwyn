variable "brevo_api_key" {
  description = "Brevo API key used only by Terraform, separate from the API's runtime BREVO_API_KEY (README.md). Supply as TF_VAR_brevo_api_key; never put it in terraform.tfvars."
  type        = string
  sensitive   = true
}
