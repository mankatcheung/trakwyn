# The PostHog project key is stated once, as infra/posthog's output, and read
# from that root's state here, the same way infra/vercel does, so it is never
# pasted into the API's config by hand (JEF-566).
#
# This couples apply order: infra/posthog must have been applied at least once
# before this root can plan. The only value read, the phc_ key, is public (it
# ships in the web bundle), which is why it is a plain env var and not a
# Secret Manager secret. Do not use this path for a value that is secret.
data "terraform_remote_state" "posthog" {
  backend = "gcs"

  config = {
    bucket = var.state_bucket
    prefix = "trakwyn/posthog"
  }
}
