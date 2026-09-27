terraform {
  required_version = ">= 1.9"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.25"
    }
  }

  # Same bucket as the other roots, separate prefix:
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "trakwyn/cloudflare"
  }
}

# Provider arguments are never written to state, so the token set here lives
# only in the environment of whoever runs `terraform apply`
# (TF_VAR_cloudflare_api_token). Scope it to the one zone (README.md).
provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
