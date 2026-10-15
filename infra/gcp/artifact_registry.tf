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

# Our own copy of the public base images CI builds and tests on (JEF-406), so
# no CI job depends on anonymous pulls from a registry whose rate limit is
# shared with every other runner on the same IP. The mirror-base-images
# workflow fills it from infra/base-images.txt; nothing else writes to it.
resource "google_artifact_registry_repository" "base" {
  location      = var.region
  repository_id = "base-images"
  format        = "DOCKER"
  description   = "Mirrored upstream base images (node, postgres), pushed by the mirror-base-images workflow."

  cleanup_policy_dry_run = false

  # KEEP wins over DELETE, so the five newest versions of each image survive
  # however old they are. The pinned digest is always among them: a pin moves
  # only when the file is edited, and a bump adds one version.
  cleanup_policies {
    id     = "keep-recent"
    action = "KEEP"
    most_recent_versions {
      keep_count = 5
    }
  }

  # A moved tag leaves the old digest untagged; thirty days is long enough to
  # roll a pin back, short enough not to accumulate layers.
  cleanup_policies {
    id     = "delete-untagged"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "2592000s"
    }
  }

  depends_on = [google_project_service.enabled]
}
