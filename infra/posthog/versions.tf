terraform {
  required_version = ">= 1.9"

  required_providers {
    posthog = {
      source  = "PostHog/posthog"
      version = "~> 1.0"
    }
  }

  # Same bucket as infra/gcp and infra/axiom, separate prefix. infra/vercel
  # reads this state's outputs through terraform_remote_state, so the prefix
  # is referenced there too (infra/vercel/posthog.tf):
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "trakwyn/posthog"
  }
}

# Provider arguments are never written to state, so the personal API key set
# here lives only in the environment of whoever runs `terraform apply`
# (TF_VAR_posthog_api_key). Same arrangement as infra/axiom.
provider "posthog" {
  api_key         = var.posthog_api_key
  host            = var.posthog_host
  organization_id = var.organization_id
  project_id      = var.project_id
}
