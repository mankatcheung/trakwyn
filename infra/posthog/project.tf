# The project already exists (JEF-349); these adopt it rather than create a
# second one. Once it is in state, an import block is a no-op.
#
# The two IDs differ in shape on purpose: the provider's project import
# takes `<organization_id>/<project_id>` (no provider-level default for the
# organization), while the settings import takes the bare project ID.
import {
  to = posthog_project.web
  id = "${var.organization_id}/${var.project_id}"
}

import {
  to = posthog_project_settings.web
  id = var.project_id
}

# Managed for its api_token: the public phc_ key the clients send events
# with, which infra/vercel reads from this state (outputs.tf). Timezone is
# left to the dashboard.
resource "posthog_project" "web" {
  name = var.project_name
}

# The server-side half of the privacy posture in the root CLAUDE.md. The
# clients already switch these off in code (apps/web/src/lib/analytics and
# the mobile equivalent); setting them on the project too means a dashboard
# toggle cannot quietly turn one back on for every client that does not
# override it, and a plan shows it if somebody tries.
#
# Settings apply to the whole project, so to every client that sends to it:
# mobile as well as web, if EXPO_PUBLIC_POSTHOG_KEY is the same key.
#
# Not here, because the provider does not expose it: click autocapture.
# That opt-out still lives only in the clients (`autocapture: false` on web,
# no <PostHogProvider autocapture> on mobile). The same goes for dead clicks,
# product tours and conversations (JEF-366), pinned off in the web client
# only. See README.md.
resource "posthog_project_settings" "web" {
  project_id = var.project_id

  # Replay would record the pages themselves: salaries, notes, company
  # names. Network capture only feeds replay, and would record request
  # bodies, so it goes with it.
  session_recording_opt_in   = false
  capture_performance_opt_in = false

  # Heatmaps record where every click lands, keyed by URL, which is the
  # same exposure autocapture was turned off to avoid.
  heatmaps_opt_in = false

  # Surveys inject PostHog UI into the page; nothing uses them.
  surveys_opt_in = false

  # "Discard client IP data" (JEF-366): an IP is personal data, and the only
  # location this app needs is the country, so storing it fails GDPR data
  # minimisation. This also turns off PostHog's GeoIP; the web client sends
  # a `country` property from Vercel's x-vercel-ip-country instead. It is
  # project-wide, so mobile events lose their IP and GeoIP too.
  anonymize_ips = true

  # On: the web client reports LCP, INP, CLS and FCP as $web_vitals (JEF-360,
  # `capture_performance.web_vitals` in apps/web/src/lib/analytics). URLs on
  # those events are rewritten to route templates before they leave, and
  # attribution (which element was slow) is off. The client setting wins
  # over this one; this keeps the project stating the same intent.
  autocapture_web_vitals_opt_in = true

  # On: this is the error reporting JEF-349 set PostHog up for. Both clients
  # pass through the before_send scrubber before an exception leaves.
  autocapture_exceptions_opt_in = true
}
