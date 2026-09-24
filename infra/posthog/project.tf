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
# no <PostHogProvider autocapture> on mobile). See README.md.
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

  # Web vitals are not used by anything, and every event is one a call site
  # named on purpose (ANALYTICS_EVENTS).
  autocapture_web_vitals_opt_in = false

  # On: this is the error reporting JEF-349 set PostHog up for. Both clients
  # pass through the before_send scrubber before an exception leaves.
  autocapture_exceptions_opt_in = true
}
