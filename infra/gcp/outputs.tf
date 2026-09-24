output "service_uri" {
  description = "The service's run.app URL, for smoke-testing before DNS points at the custom domain."
  value       = google_cloud_run_v2_service.api.uri
}

output "image_repository" {
  description = "Where CI pushes images, tagged with the commit SHA."
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.api.repository_id}/api"
}

output "workload_identity_provider" {
  description = "GitHub repository variable GCP_WIF_PROVIDER."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "GitHub repository variable GCP_DEPLOYER_SA."
  value       = google_service_account.github_deployer.email
}

output "domain_dns_records" {
  description = "DNS records to create for the custom domain. Empty until Cloud Run has provisioned the mapping; run `terraform apply -refresh-only` to fetch them."
  value       = try(google_cloud_run_domain_mapping.api.status[0].resource_records, [])
}
