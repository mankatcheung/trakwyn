# Secret containers only. Values are added out of band so they never enter
# Terraform state (README.md, "Secrets"):
#   printf '%s' "$VALUE" | gcloud secrets versions add jwt-secret --data-file=-
resource "google_secret_manager_secret" "api" {
  for_each = var.secret_env_vars

  secret_id = lower(replace(each.value, "_", "-"))

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.enabled]
}

resource "google_secret_manager_secret_iam_member" "api_runtime" {
  for_each = google_secret_manager_secret.api

  secret_id = each.value.id
  role      = "roles/secretmanager.secretAccessor"
  member    = google_service_account.api_runtime.member
}
