# The PostHog project key is stated once, as infra/posthog's output, and read
# from that root's state here, so it is never pasted into Vercel by hand.
#
# This couples apply order: infra/posthog must have been applied at least
# once before this root can plan. It also means whoever runs this root can
# read all of infra/posthog's state, which is fine because nothing in it is
# secret. The only value read, the phc_ key, is public (it ships in the
# bundle). Do not use this path for a value that is secret.
data "terraform_remote_state" "posthog" {
  backend = "gcs"

  config = {
    bucket = var.state_bucket
    prefix = "trakwyn/posthog"
  }
}
