terraform {
  required_version = ">= 1.9"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 5.17"
    }
  }

  # Same bucket as the other roots, separate prefix:
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "trakwyn/vercel"
  }
}

# Provider arguments are never written to state, so the token set here lives
# only in the environment of whoever runs `terraform apply`
# (TF_VAR_vercel_api_token). It is not the VERCEL_TOKEN repo secret CI
# deploys with, though it can be scoped the same way (README.md).
provider "vercel" {
  api_token = var.vercel_api_token
  team      = var.team_id
}
