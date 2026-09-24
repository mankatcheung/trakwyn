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

    # A Google-signed ID token for the cron-invoker account, minted per
    # request (JEF-336). It replaced a CRON_SECRET bearer header, which had to
    # be read into Terraform state to be set here. The audience is API_ORIGIN
    # rather than the run.app URI the request goes to: the service cannot be
    # handed its own URI as an env var without a dependency cycle, and Google
    # signs whatever audience the job asks for.
    oidc_token {
      service_account_email = google_service_account.cron_invoker.email
      audience              = local.plain_env.API_ORIGIN
    }
  }

  depends_on = [google_project_service.enabled]
}
