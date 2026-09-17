terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.3"
    }
  }

  # The bucket is passed at init time, since it is the one resource created
  # by hand before Terraform can run (see README.md, "Bootstrap"):
  #   terraform init -backend-config="bucket=<project-id>-tfstate"
  backend "gcs" {
    prefix = "trakwyn/api"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}
