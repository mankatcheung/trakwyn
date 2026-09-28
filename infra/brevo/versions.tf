terraform {
  required_version = ">= 1.9"

  required_providers {
    # Community provider (single maintainer, v0.1.x). Pinned exactly and
    # reviewed at this version before it was given a key (JEF-380); read the
    # diff again before bumping it.
    brevo = {
      source  = "bbieniek/brevo"
      version = "= 0.1.5"
    }
  }

  # Same bucket as the other roots, separate prefix:
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "trakwyn/brevo"
  }
}

# Provider arguments are never written to state, so the key set here lives
# only in the environment of whoever runs `terraform apply`
# (TF_VAR_brevo_api_key). It is passed explicitly because the provider would
# otherwise fall back to BREVO_API_KEY, the API's runtime key, if that
# happened to be in the shell.
provider "brevo" {
  api_key = var.brevo_api_key
}
