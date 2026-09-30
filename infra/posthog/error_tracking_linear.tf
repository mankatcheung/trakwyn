# Error tracking -> Linear (JEF-382).
#
# PostHog's own Linear destination (template-linear): on a new or reopened
# error-tracking issue it creates a Linear issue through the OAuth-connected
# workspace and attaches a link back to the PostHog issue. PostHog groups
# exceptions into issues before this fires, so each Linear issue is one
# distinct error, not one occurrence; a reopen (a resolved issue coming back)
# files a fresh one, which is what a regression should do.
#
# The Linear integration itself is OAuth, which the provider cannot do, so
# it is connected once in the dashboard (README.md, "Linear issues") and its
# ID passed in. Until then linear_integration_id is null and nothing here is
# created.

locals {
  # The merge-stable deep link PostHog's own alert templates use: through the
  # fingerprint redirect, so it survives issues being merged.
  error_issue_link = "{project.url}/error_tracking/fingerprint/{replaceAll(replaceAll(encodeURLComponent(event.properties.fingerprint), '(', '%28'), ')', '%29')}?timestamp={event.properties.exception_timestamp}&utm_source=alert&utm_campaign=error_tracking_alert&utm_medium=linear"

  # Hog template: each {…} is evaluated against the lifecycle event, which
  # carries the originating exception's properties. A missing property
  # renders empty. The whole $exception_list goes in, pretty-printed: it is
  # every exception in the chain with its type, message, mechanism and
  # resolved stack frames (source-mapped when source maps are uploaded),
  # which is the part a fix starts from.
  linear_issue_description = <<-MD
    **{event.properties.name}**

    {event.properties.description}

    - **PostHog issue:** [open in PostHog](${local.error_issue_link})
    - **Status:** {event.properties.status}
    - **Exception types:** {jsonStringify(event.properties.$exception_types)}
    - **Source:** {event.properties.$lib} {event.properties.$lib_version}
    - **Release:** {event.properties.release}
    - **App version:** {event.properties.$app_version}
    - **Where:** {event.properties.$current_url ?? event.properties.$screen_name}
    - **Browser:** {event.properties.$browser} {event.properties.$browser_version}
    - **OS / device:** {event.properties.$os} {event.properties.$os_version} {event.properties.$device_type}
    - **First seen:** {event.properties.exception_timestamp}

    ### Exception list

    ```json
    {jsonStringify(event.properties.$exception_list, 2)}
    ```

    ---
    PostHog issue ID: `{event.distinct_id}`
  MD
}

resource "posthog_hog_function" "error_tracking_linear" {
  count = var.linear_integration_id == null ? 0 : 1

  name        = "Linear issue on error issue created or reopened"
  description = "Files a Linear issue with the exception and its stack for every new or reopened error-tracking issue (JEF-382). Managed by infra/posthog."
  type        = "internal_destination"
  template_id = "template-linear"
  enabled     = true

  filters_json = jsonencode({
    source = "internal-events"
    events = [
      { id = "$error_tracking_issue_created", type = "events" },
      { id = "$error_tracking_issue_reopened", type = "events" },
    ]
  })

  inputs_json = jsonencode({
    linear_workspace  = { value = var.linear_integration_id }
    team              = { value = var.linear_team_id }
    title             = { value = "[PostHog] {event.properties.name}" }
    description       = { value = local.linear_issue_description }
    posthog_issue_id  = { value = "{event.distinct_id}" }
    posthog_issue_url = { value = local.error_issue_link }
  })

  lifecycle {
    precondition {
      condition     = var.linear_team_id != null
      error_message = "linear_team_id is required once linear_integration_id is set."
    }
  }
}
