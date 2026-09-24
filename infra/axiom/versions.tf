terraform {
  required_version = ">= 1.9"

  required_providers {
    axiom = {
      source  = "axiomhq/axiom"
      version = "~> 1.6"
    }
  }

  # Same bucket as infra/gcp, separate prefix, so the two roots never share a
  # state file (see README.md, "Why a separate root"):
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "trakwyn/axiom"
  }
}

# Provider arguments are never written to state, so the token set here lives
# only in the environment of whoever runs `terraform apply`
# (TF_VAR_axiom_api_token). It is not a Secret Manager secret and it is not an
# infra/gcp variable.
provider "axiom" {
  api_token = var.axiom_api_token
}
