locals {
  # Replaces the `crons` block of the former apps/api/vercel.json: same paths,
  # same schedule. /admin/push-notifications/send was never scheduled there
  # and still isn't.
  admin_jobs = {
    "digest-send"    = "/admin/digest/send"
    "reminders-send" = "/admin/reminders/send"
    "trash-purge"    = "/admin/trash/purge"
  }
}

# Reads the current CRON_SECRET so the jobs can send it as a bearer token
# (cronAuth.ts). This puts the value in Terraform state, an accepted trade-off
# for now that is tracked separately against moving the routes to Cloud
# Scheduler OIDC tokens. Keep the state bucket's IAM tight.
data "google_secret_manager_secret_version" "cron_secret" {
  secret = google_secret_manager_secret.api["CRON_SECRET"].secret_id
}

resource "google_cloud_scheduler_job" "admin" {
  for_each = local.admin_jobs

  name      = "trakwyn-api-${each.key}"
  region    = var.region
  schedule  = "0 9 * * *"
  time_zone = "Etc/UTC"
  # Matches the service's request timeout.
  attempt_deadline = "600s"

  # No retries: the digest and reminder routes send email, so retrying after a
  # timeout that actually succeeded server-side would email people twice.
  retry_config {
    retry_count = 0
  }

  http_target {
    http_method = "POST"
    # The run.app URL rather than the custom domain, so the jobs keep working
    # whatever state the domain mapping's DNS and certificate are in.
    uri = "${google_cloud_run_v2_service.api.uri}${each.value}"
    headers = {
      Authorization = "Bearer ${data.google_secret_manager_secret_version.cron_secret.secret_data}"
    }
  }

  depends_on = [google_project_service.enabled]
}
