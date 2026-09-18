# The identity the API runs as. It can read its own secrets and nothing else.
resource "google_service_account" "api_runtime" {
  account_id   = "trakwyn-api"
  display_name = "trakwyn-api runtime"
}

# The identity the Cloud Scheduler jobs call the admin routes as (JEF-336).
# It holds no roles: the service is public, so nothing needs granting for the
# request to arrive. The jobs attach a Google-signed ID token for this
# account, and cronAuth.ts accepts it only when its email matches
# CRON_INVOKER_SA — a shared secret no longer has to pass through Terraform.
resource "google_service_account" "cron_invoker" {
  account_id   = "cron-invoker"
  display_name = "Cloud Scheduler caller of the trakwyn-api admin routes"
}

# The identity CI deploys as: push images, roll out revisions of this one
# service, and run them as the runtime account.
resource "google_service_account" "github_deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer"
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  location   = google_artifact_registry_repository.api.location
  repository = google_artifact_registry_repository.api.name
  role       = "roles/artifactregistry.writer"
  member     = google_service_account.github_deployer.member
}

# On the one service rather than the project: the project (job-finder-503217)
# is not dedicated to this API, and a deploy only needs to update this
# service.
resource "google_cloud_run_v2_service_iam_member" "deployer_deploy" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.developer"
  member   = google_service_account.github_deployer.member
}

resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  service_account_id = google_service_account.api_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.github_deployer.member
}
