# infra/posthog: the PostHog project's privacy settings

The PostHog project the web and mobile apps report errors and product events to (JEF-349), as Terraform (JEF-363). The clients already switch off everything that could record page content. This root sets the same switches on the project itself, so a dashboard toggle cannot quietly turn one back on, and a `plan` shows it if somebody does. It also publishes the project's public key, which `infra/vercel` reads instead of having it pasted into the Vercel dashboard.

## What it owns

| Resource                       | What                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `posthog_project.web`          | The existing EU project (imported). Managed for its name and its `api_token`. |
| `posthog_project_settings.web` | The project-level switches below (imported).                                  |
| Output `project_api_key`       | The public `phc_` key; `infra/vercel` sets it as `VITE_POSTHOG_KEY`.          |

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
- **Data region.** EU vs. US is fixed when the organization is created. It is a property of the account, not a setting. `posthog_host` here and `VITE_POSTHOG_HOST` in `infra/vercel` both point at the EU cloud.

Deliberately left to the dashboard: the project's timezone, authorized URLs, and the internal/test user filters.

## Why a separate root

For the same reason as `infra/axiom`: the PostHog personal API key is a provider argument, and Terraform never writes provider arguments to state. It lives only in the environment of whoever runs `apply`. The state (same GCS bucket as the other roots, prefix `trakwyn/posthog`) holds the project settings and the public `phc_` key. Nothing in it is secret, which matters because `infra/vercel` reads this state (see its README).

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and a PostHog **personal** API key. The project key the clients use cannot manage anything.

Create it under **Account settings → Personal API keys → Create personal API key**. Scope it to the one organization and project, and give it `project:read` and `project:write` (settings live on the project) plus `organization:read` (the project import resolves the organization). If the first `plan` fails with a 403, the message names the missing scope.

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
