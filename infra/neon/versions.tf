terraform {
  required_version = ">= 1.9"

  required_providers {
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.18"
    }
  }

  # Same bucket as the other roots, separate prefix:
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "trakwyn/neon"
  }
}

# Provider arguments are never written to state, so the key set here lives
# only in the environment of whoever runs `terraform apply`
# (TF_VAR_neon_api_key).
provider "neon" {
  api_key = var.neon_api_key
}
