terraform {
  required_version = ">= 1.9"

  required_providers {
    upstash = {
      source  = "upstash/upstash"
      version = "~> 2.1"
    }
  }

  # Same bucket as the other roots, separate prefix:
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "trakwyn/upstash"
  }
}

# Provider arguments are never written to state, so the management key set
# here lives only in the environment of whoever runs `terraform apply`
# (TF_VAR_upstash_api_key). Unlike the other roots' tokens it cannot be
# scoped: it acts on the whole Upstash account (README.md).
provider "upstash" {
  email   = var.upstash_email
  api_key = var.upstash_api_key
}
