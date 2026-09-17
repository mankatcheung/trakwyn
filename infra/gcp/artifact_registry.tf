resource "google_artifact_registry_repository" "api" {
  location      = var.region
  repository_id = "trakwyn"
  format        = "DOCKER"
  description   = "trakwyn-api images, pushed by CI's deploy-api job."

  cleanup_policy_dry_run = false

  # KEEP wins over DELETE, so the five newest images (enough to roll back to)
  # survive however old they are.
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  cleanup_policies {
    id     = "delete-old"
    action = "DELETE"
    condition {
      tag_state  = "ANY"
      older_than = "604800s"
    }
  }

  depends_on = [google_project_service.enabled]
}
