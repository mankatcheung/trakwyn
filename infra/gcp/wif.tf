# Keyless GitHub Actions -> GCP auth. No service-account JSON key exists.
resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.enabled]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "trakwyn"
  display_name                       = "trakwyn repository"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
    "attribute.ref"        = "assertion.ref"
  }

  # Only this repository's workflows on main or on a pull request may exchange
  # a token (JEF-407). What each may then act as is decided by the bindings
  # below, not here: a pull request can become the read-only CI reader and
  # nothing else, so it still cannot deploy.
  attribute_condition = "assertion.repository == \"${var.github_repository}\" && (assertion.ref == \"refs/heads/main\" || assertion.ref.startsWith(\"refs/pull/\"))"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# The deployer is main-only: the pool now also admits pull-request tokens, so
# the binding is on the ref, not just the repository. The provider condition
# already limits every token to this repository, so the ref alone is enough.
resource "google_service_account_iam_member" "github_impersonates_deployer" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.ref/refs/heads/main"
}

# The read-only CI reader may be impersonated from main and from pull requests.
resource "google_service_account_iam_member" "github_impersonates_ci_reader" {
  service_account_id = google_service_account.github_ci_reader.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}
