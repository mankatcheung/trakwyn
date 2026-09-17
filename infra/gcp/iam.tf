# The identity the API runs as. It can read its own secrets and nothing else.
resource "google_service_account" "api_runtime" {
  account_id   = "trakwyn-api"
  display_name = "trakwyn-api runtime"
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

# Project-wide rather than on the one service: `gcloud run deploy` also reads
# project-level Cloud Run state while rolling out, and a deploy that fails on
# permissions is hard to diagnose from CI. The project holds nothing but this
# API, so the wider grant reaches nothing else.
resource "google_project_iam_member" "deployer_deploy" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = google_service_account.github_deployer.member
}

resource "google_service_account_iam_member" "deployer_acts_as_runtime" {
  service_account_id = google_service_account.api_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = google_service_account.github_deployer.member
}
