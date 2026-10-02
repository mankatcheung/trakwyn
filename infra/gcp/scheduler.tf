locals {
  # Replaces the `crons` block of the former apps/api/vercel.json: same paths,
  # same daily cadence. /admin/push-notifications/send was never scheduled
  # there and still isn't.
  #
  # Staggered five minutes apart rather than all at 09:00. Fired together
  # against a service scaled to zero, all three waited on one cold start, and
  # when that instance failed its startup probe the request assigned to it was
  # answered 503 before the app ran; which of the three that was is chance.
  # The purge goes first because it is the one that can be retried, so it
  # absorbs the cold start and the two email jobs arrive at an instance that
  # is already warm.
  #
  # Only the purge retries. It is idempotent: a second run finds nothing left
  # to remove. The digest and reminder routes send email, so retrying after a
  # timeout that actually succeeded server-side would email people twice.
  admin_jobs = {
    "trash-purge" = {
      path        = "/admin/trash/purge"
      schedule    = "0 9 * * *"
      retry_count = 2
    }
    "digest-send" = {
      path        = "/admin/digest/send"
      schedule    = "5 9 * * *"
      retry_count = 0
    }
    "reminders-send" = {
      path        = "/admin/reminders/send"
      schedule    = "10 9 * * *"
      retry_count = 0
    }
  }
}

resource "google_cloud_scheduler_job" "admin" {
  for_each = local.admin_jobs

  name      = "trakwyn-api-${each.key}"
  region    = var.region
  schedule  = each.value.schedule
  time_zone = "Etc/UTC"
  # Matches the service's request timeout.
  attempt_deadline = "600s"

  retry_config {
    retry_count = each.value.retry_count
    # Long enough for the instance that failed to be replaced; the default 5s
    # would retry into the same cold start.
    min_backoff_duration = "30s"
  }

  http_target {
    http_method = "POST"
    # The run.app URL rather than the custom domain, so the jobs keep working
    # whatever state the domain mapping's DNS and certificate are in.
    uri = "${google_cloud_run_v2_service.api.uri}${each.value.path}"

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
