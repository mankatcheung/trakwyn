# infra/posthog: the PostHog project's privacy settings and mobile release health

The PostHog project the web and mobile apps report errors and product events to (JEF-349), as Terraform (JEF-363). The clients already switch off everything that could record page content. This root sets the same switches on the project itself, so a dashboard toggle cannot quietly turn one back on, and a `plan` shows it if somebody does. It also publishes the project's public key, which `infra/vercel` reads instead of having it pasted into the Vercel dashboard.

## What it owns

| Resource                       | What                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `posthog_project.web`          | The existing EU project (imported). Managed for its name and its `api_token`. |
| `posthog_project_settings.web` | The project-level switches below (imported).                                  |
| Output `project_api_key`       | The public `phc_` key; `infra/vercel` sets it as `VITE_POSTHOG_KEY`.          |
| `release_health.tf`            | The mobile release health dashboard and its alert (JEF-368, below).           |
| `error_tracking_linear.tf`     | Files a Linear issue per new or reopened error issue (JEF-382, below).        |

### Project settings

| Setting                         | Value   | Why                                                                                                   |
| ------------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `session_recording_opt_in`      | `false` | Replay records the page: salaries, notes, company names.                                              |
| `capture_performance_opt_in`    | `false` | Network capture only feeds replay, and would record request bodies.                                   |
| `heatmaps_opt_in`               | `false` | Records where every click lands, which is the exposure autocapture was turned off to avoid.           |
| `surveys_opt_in`                | `false` | Injects PostHog UI into the page; nothing uses it.                                                    |
| `anonymize_ips`                 | `true`  | JEF-366, GDPR data minimisation: no `$ip` stored, so no GeoIP. Location comes from `country` (below). |
| `autocapture_web_vitals_opt_in` | `true`  | JEF-360 reports LCP, INP, CLS and FCP, with URLs rewritten to route templates and attribution off.    |
| `autocapture_exceptions_opt_in` | `true`  | This is the error reporting PostHog is here for. Exceptions pass the `before_send` scrubber first.    |

These apply to the whole project, so to mobile too if it sends with the same key.

### Why autocapture, replay and network capture stay off

Trakwyn's screens hold exactly what a job seeker would not want in a third-party service: company names, job titles, salaries, interview notes, cover letters and AI assistant conversations. Each of these three features sends some of that to PostHog without any code choosing to.

**Autocapture** records every click and form interaction automatically, with the text of the element clicked and some of the page around it. Clicking an application row could send "Senior Engineer · Acme Ltd · £85,000 · Interview Tuesday" as event data. The `before_send` scrubber does not make this safe. It removes known sensitive property names (`salary`, `email`, `token`…) and redacts anything shaped like an email, a JWT, a bearer token or a URL query string. A company name or a job title matches none of those patterns, so free-form page text passes straight through. The scrubber cleans events whose shape the code knows, not whatever text happens to be on the screen.

**Session replay** records the page itself, its structure and every change to it, so PostHog can play the visit back like a video. That is everything on the screen, whether or not anyone interacts with it, which makes it strictly worse than autocapture. PostHog masks form inputs and password fields by default, but not ordinary page text: a salary in a table or a note on a card is recorded unless every such element is explicitly marked up, and one missed element leaks. The scrubber cannot help, because a page snapshot is not an event property. Mobile replay records the screen the same way. Turning replay on would need input and text masking configured first, as the comment in `apps/web/src/lib/analytics/analytics.ts` says.

**Network capture** records the app's requests as part of a replay: the URL and timing, and optionally headers and request/response bodies.

- Nearly every request goes to `/graphql`. Its request body carries the variables, including note text, salaries, chat messages and **the password on the login mutation**. The response carries the user's data back.
- The mobile app sends its access token in the `Authorization` header, so recording headers would store working credentials in PostHog.
- Timing alone tells you little here: with every operation on the same URL, it cannot say _which_ one was slow. The API's Axiom traces already answer that, named per operation (e.g. `POST /graphql query applications`).
- It exists only to feed replay, so with replay off it adds nothing.

**What that costs.** With these off, there is no history for questions nobody thought to ask in advance ("how many people clicked Archive last month?"), no UI-level funnels, and no rage- or dead-click detection. The app sends named events instead: every event is added deliberately to `ANALYTICS_EVENTS`, with non-identifying properties only. When a new question comes up, add an event for it. That costs a small PR and there is no data before it ships, but every event leaving the app was chosen on purpose and passes the scrubber. It also keeps the cookie banner honest: people agree to a known list of events, not "anything on the screen".

**Where each is enforced:**

| Feature         | Client                                                                               | Project (this root)                  |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| Autocapture     | `autocapture: false` on web; `<PostHogProvider autocapture>` never mounted on mobile | Not settable (below). Check by hand. |
| Session replay  | `disable_session_recording: true` on web; `enableSessionReplay: false` on mobile     | `session_recording_opt_in = false`   |
| Network capture | `capture_performance.network_timing: false` on web                                   | `capture_performance_opt_in = false` |
| Dead clicks     | `capture_dead_clicks: false` on web                                                  | Not settable (below).                |
| Heatmaps        | `capture_heatmaps: false` on web                                                     | `heatmaps_opt_in = false`            |
| Surveys         | `disable_surveys: true` on web                                                       | `surveys_opt_in = false`             |
| Product tours   | `disable_product_tours: true` on web                                                 | Not settable (below).                |
| Conversations   | `disable_conversations: true` on web                                                 | Not settable (below).                |
| Client IPs      | None: the IP is sent with every request, whatever the client does                    | `anonymize_ips = true`               |

Replay, network capture, heatmaps and surveys are guarded twice: if a future client forgets its flag, the project setting still keeps them off, and a dashboard change shows up in `plan`. Autocapture, dead clicks, product tours and conversations rely on the client alone. IP discarding is the reverse: only the project can do it.

**Location without IPs (JEF-366).** With `anonymize_ips` on, PostHog stores no `$ip` and adds no `$geoip_*` properties. The web client adds a two-letter `country` to every event in `before_send` instead. It comes from Vercel's `x-vercel-ip-country` header, which `getRequiresCookieConsent` already reads for the consent check, so PostHog never sees the IP. Break down by `country`, not `$geoip_country_name`. City-level location is gone on purpose. Mobile events carry no location at all.

### What the provider cannot manage

- **Click autocapture.** `posthog_project_settings` (provider `PostHog/posthog` 1.0.21) has no autocapture opt-out; the dashboard's "Autocapture" toggle is not exposed. The opt-out still lives only in the clients: `autocapture: false` in `apps/web/src/lib/analytics/analytics.ts`, and never mounting `<PostHogProvider autocapture>` on mobile. That is the single most important line in the web client, and it has no server-side backstop. Check the toggle by hand after any change to the project, and re-check this list when bumping the provider.
- **Dead clicks, product tours and conversations.** The provider has no setting for any of them, so the web client's `capture_dead_clicks: false`, `disable_product_tours: true` and `disable_conversations: true` are the only guards. Dead clicks matter most: they record the clicked element, as autocapture would.
- **Error-tracking alerts that email.** See "The alert" above.
- **Data region.** EU vs. US is fixed when the organization is created. It is a property of the account, not a setting. `posthog_host` here and `VITE_POSTHOG_HOST` in `infra/vercel` both point at the EU cloud.

Deliberately left to the dashboard: the project's timezone, authorized URLs, and the internal/test user filters.

## Server-side errors (JEF-374)

The web app's Vercel function (SSR renders, server functions, and anything that escapes the request handler) reports to this project too, as `$exception` events from `apps/web/src/server/observability/`, so client and server errors are grouped together in **Error Tracking**. They are sent straight to the capture endpoint (`/i/v0/e/`) with the public project key; `posthog-node` is not used.

Tell them apart by `$lib = trakwyn-web-server` or `source = server`. `web_event` holds the failure (`web.ssr.failed`, `web.server_fn.failed`, `web.request.failed`), and `phase` says which part of a render failed (`load`, `render`, `shell`). `vercel.request_id` finds the same request in Vercel's runtime log, and `release` matches the browser's.

**Why no consent gate.** These are operational error reports about the server, not analytics about a visitor, and they carry nothing that identifies one: `$process_person_profile: false`, a `distinct_id` that is Vercel's request id (or a random one), no cookies, headers, query string or server-function input, and messages and stacks through the same `scrubString` the clients use. The IP PostHog sees is the Vercel function's, and `anonymize_ips` discards it anyway (`$geoip_disable` is set as well). The same data went to Axiom before JEF-374 on the same basis; what changes is the processor.

### The alert (set up by hand)

This replaces the Axiom `web_server_error` monitor. PostHog builds error-tracking alerts as `internal_destination` hog functions triggered by `$error_tracking_issue_created` / `$error_tracking_issue_reopened`. The provider has `posthog_hog_function`, but email delivery goes through PostHog's email integration, which it cannot set up, so the alert is managed in the dashboard:

1. **Error tracking → Configuration → Alerts → New alert.**
2. Trigger **Issue created**; destination **Email** to the same address `infra/axiom`'s `alert_emails` uses. (Slack or a webhook work the same way if email is not offered.)
3. Leave the filter empty to alert on every web error, or add the event property `$lib` = `trakwyn-web-server` for server errors only. The lifecycle events carry the originating exception's properties, so the filter applies.
4. Repeat with trigger **Issue reopened**.
5. Send the test event below and confirm the email arrives.

### Checking it end to end

Production has no safe way to make a render fail on demand, so send one event with the project key (it is public):

```bash
curl -X POST https://eu.i.posthog.com/i/v0/e/ -H 'Content-Type: application/json' -d "{
  \"api_key\": \"$(terraform output -raw project_api_key)\",
  \"event\": \"\$exception\",
  \"distinct_id\": \"jef-374-test\",
  \"properties\": {
    \"\$process_person_profile\": false,
    \"\$lib\": \"trakwyn-web-server\",
    \"source\": \"server\",
    \"web_event\": \"web.ssr.failed\",
    \"phase\": \"test\",
    \"\$exception_list\": [{\"type\": \"Error\", \"value\": \"JEF-374 test $(date +%s)\", \"mechanism\": {\"type\": \"generic\", \"handled\": false, \"synthetic\": false}}]
  }
}"
```

A new issue appears in Error Tracking within a minute or two, and the alert emails. Resolve the issue afterwards. The timestamp in `value` makes each run a new issue.

## Linear issues (JEF-382)

Every new or reopened error-tracking issue, from the web client, the web server and mobile, becomes a Linear issue. `error_tracking_linear.tf` is PostHog's own Linear destination (`template-linear`), triggered by `$error_tracking_issue_created` and `$error_tracking_issue_reopened`. PostHog has already grouped exceptions into issues by then, so there is one Linear issue per distinct error, not per occurrence. A reopen (a resolved issue coming back) files a new one, which is how a regression shows up.

Each Linear issue carries:

- the issue name and message;
- a merge-stable link back to the PostHog issue, also attached by PostHog as a Linear link;
- `$lib`, `release` (the commit SHA, JEF-362), app version, URL or screen, browser, OS and device;
- the whole `$exception_list`, pretty-printed: every exception in the chain with its type, message, mechanism and stack frames. Frames are source-mapped only when source maps are uploaded.

It runs alongside the email alert above, not instead of it.

**Setting it up.** The Linear integration is OAuth, which the provider cannot do, so it is connected once by hand:

1. **Error tracking → Configuration → Integrations → Linear → Connect workspace**, and authorise the Trakwyn workspace.
2. Find the integration's numeric ID with the personal API key: `curl -s -H "Authorization: Bearer $TF_VAR_posthog_api_key" "https://eu.posthog.com/api/environments/<project_id>/integrations/" | jq '.results[] | select(.kind == "linear") | .id'`.
3. The Trakwyn team's UUID is in `terraform.tfvars.example`. It is the team's UUID, not its `JEF` key, and the same value as `infra/gcp`'s `LINEAR_TEAM_ID`.
4. Set `linear_integration_id` and `linear_team_id` in `terraform.tfvars`, then `plan` (expect one `posthog_hog_function` to create) and `apply`. The key also needs `hog_function:write`.

Until `linear_integration_id` is set, the resource has `count = 0` and applying changes nothing.

**Checking it.** Send the test exception from "Checking it end to end" above. The new issue should appear in Linear within a minute or two, titled `[PostHog] Error`, with the exception list in its description. Close the Linear issue and resolve the PostHog issue afterwards.

**Privacy.** The issue copies the exception message, stack and URL into Linear. They have been through the clients' `before_send` scrubber and the server's `scrubString` first (above), and nothing here adds a person property.

## Mobile release health (JEF-368)

PostHog has no crash-free-rate view like Sentry's Release Health, so `release_health.tf` builds one: a **Mobile release health** dashboard that answers "is 1.2.0 safe to keep rolling out?", and an alert for when it is not.

| Resource                                         | What                                                                                   |
| ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| `posthog_dashboard.mobile_release_health`        | The dashboard. Its first tile is `release_health_definitions.md`.                      |
| `posthog_insight.crash_free_by_version`          | Crash-free sessions and users per `$app_version`, last 30 days, newest first.          |
| `posthog_insight.crash_free_by_release`          | The same per `$app_version`, `$app_build` and `release` (the commit SHA, JEF-362).     |
| `posthog_insight.crash_free_sessions_daily`      | Crash-free sessions %, one line per app version, per day.                              |
| `posthog_insight.crashed_sessions_alert`         | Crashed sessions %, per day, with the minimum-volume guard. The alert watches this.    |
| `posthog_insight.top_exceptions`                 | Mobile exception issues in the newest app version vs. the one before, by sessions hit. |
| `posthog_alert.crashed_sessions`                 | Fires when a day's crash-free sessions fall below `crash_free_sessions_alert_percent`. |
| `posthog_dashboard_layout.mobile_release_health` | Tile order and sizes. Authoritative: tiles added by hand lose their place on apply.    |

The three tables are plain HogQL in `queries/`, so any of them can be pasted into **SQL editor** to dig further (change the `INTERVAL`, add a `WHERE`). The two charts are trends queries in `release_health.tf`, because PostHog alerts only run on trends insights.

### Definitions

- **Mobile event:** `$lib` is `posthog-react-native` (or `posthog-ios` / `posthog-android`, in case a native SDK reports its own name). Web and the web server send to the same project, so every query filters on this.
- **Session:** a `$session_id`. The React Native SDK (`@posthog/core`) sets one on every event whether or not replay is on, and starts a new one on every cold start, after 30 minutes without an event, and after 24 hours. A session is therefore roughly one run of the app. Every mobile session counts, not only those with `Application Opened`, which fires on cold start only (a return from background is `Application Became Active`).
- **Crash:** an `$exception` with `$exception_level = 'fatal'`. Two things produce one:
  - an uncaught JS error React Native marks fatal (`ErrorUtils` `isFatal`), sent before the app dies;
  - a native iOS or Android crash, from `@posthog/react-native-plugin`, sent by the native SDK **on the next launch**.

  Handled errors (`captureException`), non-fatal uncaught errors and unhandled promise rejections are `error`, not `fatal`, and do not count.

- **Crashed session:** a session with at least one crash. **Crashed user:** a person (`person_id`, so an anonymous session and a later login are one user) with at least one crashed session in that version or release.
- **Crash-free %:** `100 × (1 − crashed ÷ all)`, for sessions and for users.
- **Version and release of a session:** the app version and build of its first event, and the `release` of any event that has one. Native crash events skip the JS pipeline, so they carry no `release` super property (and no `scrubEvent`): the rest of the session supplies it. `unknown` means no event in the session had one, i.e. a build from before JEF-362.

**Unverified until a real crash is seen** (the native SDK sources are not in this repo): that native crash events have `$exception_level = 'fatal'`, and which `$session_id` they carry. If it is the crashed session's (as the iOS plugin does with the distinct ID), everything above holds. If it is the next launch's, the crash is counted against that session instead: the crashed-session count stays right, but it lands on the version the user relaunched into. See "Checking it with a test crash" below.

**Until JEF-300.** `app.json` is fixed at `1.0.0` and there is no EAS release stream, so every build is one row in the version table and "latest vs. previous" has nothing to compare. The release table (per commit SHA) is the useful one until versions are bumped.

### The alert

`posthog_alert.crashed_sessions` checks the previous complete day, once a day. It watches the crashed-session rate (`crashed_sessions_alert`) and fires above `100 − crash_free_sessions_alert_percent`, which is the same thing as crash-free falling below the threshold. It is the inverted rate because trends fill a day with no events with 0: 0% crash-free on a quiet day would alert, 0% crashed does not.

The guard: below `crash_alert_min_sessions` sessions in a day the rate reads 0, so one crash among five sessions on a day-old build does not page anyone. Same idea as `graphql_error_min_requests` in `infra/axiom`.

| Variable                            | Default | Meaning                                                                         |
| ----------------------------------- | ------- | ------------------------------------------------------------------------------- |
| `release_health_alert_user_ids`     | none    | Who is notified: numeric PostHog user IDs (below). Required.                    |
| `crash_free_sessions_alert_percent` | `99`    | Alert when a day's crash-free sessions fall below this.                         |
| `crash_alert_min_sessions`          | `50`    | Fewer sessions than this in a day reads as 0% crashed.                          |
| `crash_alert_app_version`           | `null`  | Watch one version (e.g. `"1.2.0"` during its rollout); `null` watches them all. |

Both numbers are starting points; there is no real traffic to set them from until JEF-300. With `null`, the alert covers every version together, which is dominated by the latest one once most users have updated. To watch a rollout closely, set `crash_alert_app_version` to the new version and apply; unset it once it is the norm.

PostHog alerts notify subscribed users (by email and in-app), and `subscribed_users` takes numeric user IDs, not the UUIDs the `posthog_user` data source returns. Find yours with the same personal API key:

```bash
curl -s -H "Authorization: Bearer $TF_VAR_posthog_api_key" \
  https://eu.posthog.com/api/organizations/@current/members/ | jq '.results[].user | {id, email}'
```

### Checking it with a test crash

Native crashes only work in a dev or EAS build, not Expo Go (`apps/mobile/CLAUDE.md`).

1. Build and run a dev build with `EXPO_PUBLIC_POSTHOG_KEY` set, and use the app for a moment.
2. Crash it: for JS, `setTimeout(() => { throw new Error('JEF-368 test crash'); })` from a dev-only button; for native on Android, `adb shell run-as <applicationId> kill -SEGV $(adb shell pidof <applicationId>)` against the debuggable dev build. On iOS, launch from the home screen rather than Xcode: the crash reporter does not run with the debugger attached.
3. Relaunch the app (a native crash is sent now).
4. In **Activity**, open the `$exception`: check `$exception_level` is `fatal`, `$lib`, `$app_version`, and whether `$session_id` matches the crashed run's `Application Opened` or the relaunch's. Update "Unverified" above with what you find.
5. The version and release tables show one crashed session. The alert does not fire: the guard holds it at 0 below `crash_alert_min_sessions`.

## Why a separate root

For the same reason as `infra/axiom`: the PostHog personal API key is a provider argument, and Terraform never writes provider arguments to state. It lives only in the environment of whoever runs `apply`. The state (same GCS bucket as the other roots, prefix `trakwyn/posthog`) holds the project settings and the public `phc_` key. Nothing in it is secret, which matters because `infra/vercel` reads this state (see its README).

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and a PostHog **personal** API key. The project key the clients use cannot manage anything.

Create it under **Account settings → Personal API keys → Create personal API key**. Scope it to the one organization and project, and give it `project:read` and `project:write` (settings live on the project) plus `organization:read` (the project import resolves the organization). The release health dashboard (JEF-368) also needs `dashboard:write`, `insight:write` and `alert:write`, and `organization_member:read` to look up user IDs. If the first `plan` fails with a 403, the message names the missing scope.

```bash
cd infra/posthog
cp terraform.tfvars.example terraform.tfvars      # organization_id, project_id, project_name
cp .envrc.example .envrc && chmod 600 .envrc      # set the key; gitignored
source .envrc                                     # or let direnv load it
terraform init -backend-config="bucket=job-finder-503217-tfstate"
terraform plan
terraform apply
```

The organization ID is under **Settings → Organization**; the project ID is the number in the dashboard URL (`/project/<id>`).

As with the other roots, CI only runs `fmt` and `validate` here. `plan` and `apply` are run by hand. Apply this root **before** `infra/vercel`: that root reads this one's output, and cannot plan until it exists.

### The first plan

The two `import` blocks adopt the live project, so the first plan must show **no create**. If it shows one, `project_id` is wrong. Expect it to show in-place updates to any setting above that differs from what is live today. Each of those is the point of this root, but read them before applying: an update to `session_recording_opt_in` from `true` means replay was on.

`project_name` must match the dashboard exactly, or apply renames the project.

Destroying `posthog_project_settings` only stops Terraform managing it; PostHog keeps the last-applied values. Destroying `posthog_project` **deletes the project and its data**. To stop managing it without deleting it, use `terraform state rm posthog_project.web`.

## After applying

1. In PostHog, check **Settings → Project → Autocapture** is still off (the provider cannot, above).
2. Load `https://www.trakwyn.com`, accept analytics in the cookie banner, and confirm a `$pageview` arrives in **Activity** within a minute.
