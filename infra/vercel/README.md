# infra/vercel: the web app's Vercel project

The Vercel project `apps/web` deploys to, as Terraform (JEF-363): its settings, its domains and its production env vars. Before this, the same things were steps in a comment at the top of `.github/workflows/ci.yml`, done once in the dashboard and not visible anywhere after.

Terraform owns configuration, CI owns releases, the same split as `infra/gcp`. CI's `deploy-web` job still builds and ships every release (`vercel build` then `vercel deploy --prebuilt --prod`, `.github/actions/vercel-deploy-production`). Nothing here deploys.

## What it owns

| File         | What                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project.tf` | `vercel_project.web` (imported): root directory `apps/web`, and **no git connection**. Connecting the repo would make Vercel deploy every push itself, before CI's tests, alongside `deploy-web`. |
| `domains.tf` | `www.trakwyn.com`, and the apex redirecting to it with a 308 (both imported). Set `apex_domain = null` if the project has no apex.                                                                |
| `env.tf`     | Production env vars `VITE_API_URL`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_KEY` (read by the browser bundle and, for error reporting, by the Vercel function).                                        |
| `posthog.tf` | Reads `infra/posthog`'s state for the PostHog project key.                                                                                                                                        |

Things worth knowing:

- **Every env var here is public.** Vite inlines `VITE_*` into the client bundle, so none is secret and none is marked `sensitive`. A sensitive Vercel var cannot be read back, which would hide its drift from `plan`. If a real secret ever needs to be a Vercel env var, give it its own resource with `sensitive = true` and `value_wo`, not an entry in `local.env`.
- **`VITE_APP_RELEASE` is not managed, on purpose.** `apps/web/vite.config.ts` fills it from `VERCEL_GIT_COMMIT_SHA` when it is unset, and a value set here would win and pin every release to one string. If it is set in the dashboard today, delete it there. JEF-362 owns release tagging.
- **Production only.** No env var targets `preview` or `development`, because nothing makes preview deployments: the project is not connected to git and `deploy-web` always passes `--prod`.
- **`VITE_POSTHOG_KEY` is stated once**, as `infra/posthog`'s `project_api_key` output, and read here through `terraform_remote_state`. That couples the roots in one direction: `infra/posthog` must be applied before this root can `plan`, and whoever runs this root needs read access to that state (same bucket, so already true). It is fine because the key is public. Don't pass a secret this way.
- **Env vars not listed in `env.tf` are left alone.** The project resource does not use the deprecated inline `environment` block, so Terraform neither reads nor removes vars it does not declare. To stop managing one by hand, add it to `local.env`. Nothing will warn you about one set in the dashboard.
- **DNS records are in `infra/cloudflare`** (JEF-371). `vercel_project_domain` attaches the domain to the project; it does not create records. `terraform show` reports `misconfigured = true` for a domain whose records are wrong.

## Why a separate root

For the same reason as `infra/axiom` and `infra/posthog`: the Vercel token is a provider argument, Terraform never writes provider arguments to state, and a separate root keeps it out of every other root's `apply`. State lives in the same GCS bucket under prefix `trakwyn/vercel`.

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), `infra/posthog` applied at least once, and a Vercel access token.

Create the token at **Account Settings → Tokens**, scoped to the team that owns the project, with an expiry. It can be a different token from CI's `VERCEL_TOKEN`, and should be: this one is on your machine, CI's is in the repo's secrets, and they can be revoked separately.

```bash
cd infra/vercel
cp terraform.tfvars.example terraform.tfvars      # team_id, project_id, project_name, state_bucket
cp .envrc.example .envrc && chmod 600 .envrc      # set the token; gitignored
source .envrc                                     # or let direnv load it
terraform init -backend-config="bucket=job-finder-503217-tfstate"
terraform plan
terraform apply
```

`team_id` and `project_id` are the `VERCEL_ORG_ID` and `VERCEL_WEB_PROJECT_ID` repo secrets, also in `.vercel/project.json` after `vercel link`, and under the project's **Settings → General**.

CI only runs `fmt` and `validate` on this root. `plan` and `apply` are run by hand.

### Adopting the live project

The project and its domains have `import` blocks, so the first `plan` adopts them. It must show **no create** for either; a create means `project_id`, `team_id` or a domain name is wrong.

Env vars need their Vercel IDs to import, and those are only in the API. List them:

```bash
curl -s -H "Authorization: Bearer $TF_VAR_vercel_api_token" \
  "https://api.vercel.com/v10/projects/<project_id>/env?teamId=<team_id>" \
  | jq '.envs[] | {key, id, target, type}'
```

Put the IDs of the three this root manages in `env_var_import_ids` in `terraform.tfvars`, then `plan`. Alternatively, delete them in the dashboard and let `apply` create them; production keeps the old values until the next deploy, so it's safe as long as no deploy runs in between.

Then read the plan before applying. Expect:

- **Env var values to change** if the dashboard held a different value, and any var that was `sensitive` to show a value change, since a sensitive value imports as `null`.
- **`build_command`, `install_command`, `output_directory`, `framework` or `dev_command` being cleared.** These have no computed default in the provider, so `project.tf` leaving one out means "unset". The build does not need them, because nitro's `vercel` preset writes the Build Output directory itself. If the plan proposes clearing one, copy the live value into `project.tf` instead, then decide separately whether it should go.
- **`git_repository` being removed.** That means the project is connected to the repo, which it should not be. Applying disconnects it, which is intended.

Once the plan shows only changes you mean, `apply`, then empty `env_var_import_ids`. Import blocks are no-ops once the resource is in state, but the map is only needed once.

## Server-side error reporting (JEF-374)

The web app's Vercel function reports its errors to PostHog with the same public `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST` the browser uses, so there is no server-only env var to manage here. Until JEF-374 it wrote to Axiom's `trakwyn-web` dataset through a hand-set `AXIOM_WEB_TOKEN` and the `AXIOM_WEB_DATASET` this root managed. After applying the removal of `AXIOM_WEB_DATASET`, delete the hand-set token too:

```bash
vercel env rm AXIOM_WEB_TOKEN production
```

## After applying

Env vars are read at build time, so nothing changes in production until the next deploy.

1. Trigger `deploy-web`: merge anything to `main`, or re-run the latest `CI & Deploy` run on `main`.
2. On `https://www.trakwyn.com`, sign in (checks `VITE_API_URL`), accept analytics in the cookie banner, and confirm a `$pageview` reaches PostHog's **Activity** within a minute (checks `VITE_POSTHOG_KEY` and `VITE_POSTHOG_HOST`).
3. Server-side error reporting has no happy-path signal, since only failures are sent. Check it with the test event in `infra/posthog/README.md` ("Server-side errors").
