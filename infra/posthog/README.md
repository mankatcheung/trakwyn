# infra/posthog: the PostHog project's privacy settings

The PostHog project the web and mobile apps report errors and product events to (JEF-349), as Terraform (JEF-363). The clients already switch off everything that could record page content. This root sets the same switches on the project itself, so a dashboard toggle cannot quietly turn one back on, and a `plan` shows it if somebody does. It also publishes the project's public key, which `infra/vercel` reads instead of having it pasted into the Vercel dashboard.

## What it owns

| Resource                       | What                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `posthog_project.web`          | The existing EU project (imported). Managed for its name and its `api_token`. |
| `posthog_project_settings.web` | The project-level switches below (imported).                                  |
| Output `project_api_key`       | The public `phc_` key; `infra/vercel` sets it as `VITE_POSTHOG_KEY`.          |

### Project settings

| Setting                         | Value   | Why                                                                                                |
| ------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `session_recording_opt_in`      | `false` | Replay records the page: salaries, notes, company names.                                           |
| `capture_performance_opt_in`    | `false` | Network capture only feeds replay, and would record request bodies.                                |
| `heatmaps_opt_in`               | `false` | Records where every click lands, which is the exposure autocapture was turned off to avoid.        |
| `surveys_opt_in`                | `false` | Injects PostHog UI into the page; nothing uses it.                                                 |
| `autocapture_web_vitals_opt_in` | `false` | Unused; every event is one a call site names (`ANALYTICS_EVENTS`).                                 |
| `autocapture_exceptions_opt_in` | `true`  | This is the error reporting PostHog is here for. Exceptions pass the `before_send` scrubber first. |

These apply to the whole project, so to mobile too if it sends with the same key.

### What the provider cannot manage

- **Click autocapture.** `posthog_project_settings` (provider `PostHog/posthog` 1.0.21) has no autocapture opt-out; the dashboard's "Autocapture" toggle is not exposed. The opt-out still lives only in the clients: `autocapture: false` in `apps/web/src/lib/analytics/analytics.ts`, and never mounting `<PostHogProvider autocapture>` on mobile. That is the single most important line in the web client, and it has no server-side backstop. Check the toggle by hand after any change to the project, and re-check this list when bumping the provider.
- **Data region.** EU vs. US is fixed when the organization is created. It is a property of the account, not a setting. `posthog_host` here and `VITE_POSTHOG_HOST` in `infra/vercel` both point at the EU cloud.

Deliberately left to the dashboard: the project's timezone, `anonymize_ips` ("Discard client IP data", which would also switch off GeoIP enrichment, so it is a product decision to make on purpose), authorized URLs, and the internal/test user filters.

## Why a separate root

For the same reason as `infra/axiom`: the PostHog personal API key is a provider argument, and Terraform never writes provider arguments to state. It lives only in the environment of whoever runs `apply`. The state (same GCS bucket as the other roots, prefix `trakwyn/posthog`) holds the project settings and the public `phc_` key. Nothing in it is secret, which matters because `infra/vercel` reads this state (see its README).

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and a PostHog **personal** API key. The project key the clients use cannot manage anything.

Create it under **Account settings → Personal API keys → Create personal API key**. Scope it to the one organization and project, and give it `project:read` and `project:write` (settings live on the project) plus `organization:read` (the project import resolves the organization). If the first `plan` fails with a 403, the message names the missing scope.

```bash
cd infra/posthog
cp terraform.tfvars.example terraform.tfvars      # organization_id, project_id, project_name
export TF_VAR_posthog_api_key=phx_...              # never in terraform.tfvars
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
