# infra/gcp: the API on Google Cloud Run

Terraform for everything `apps/api` needs on Google Cloud (JEF-335). `apps/web` stays on Vercel. The database is Neon Postgres in `aws-eu-central-1` (Frankfurt) since JEF-342; it, Upstash, Vercel Blob, Brevo and Axiom are reached over the internet.

| File                   | What it declares                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `apis.tf`              | The Google APIs the rest depends on                                                                    |
| `artifact_registry.tf` | Docker repository `trakwyn`, keeping the five newest images                                            |
| `secrets.tf`           | One Secret Manager secret per sensitive env var, containers only                                       |
| `iam.tf`               | Runtime service account (reads its secrets), CI's deployer account, and the scheduler's `cron-invoker` |
| `wif.tf`               | Workload Identity Federation: this repo's `main` branch may act as the deployer, and nothing else can  |
| `cloud_run.tf`         | The `trakwyn-api` service, public invoker binding, and the `api.trakwyn.com` domain mapping            |
| `scheduler.tf`         | The three daily `/admin/*` jobs that replaced Vercel Cron, authenticated by OIDC token                 |

**Who owns what.** Terraform owns configuration; CI owns releases. After the first apply, the service's image is in `ignore_changes`, and every merge to `main` builds, pushes and rolls out a new image through `.github/workflows/ci.yml`'s `deploy-api` job. Change scaling, env vars or IAM here; never click them into the console, or the next `terraform apply` will revert them.

**Secrets never enter Terraform state.** Terraform creates the secret containers and Cloud Run references them by name; the values are added out of band. The scheduler jobs hold no secret either: each request carries a Google-signed OIDC ID token for the `cron-invoker` service account, with `API_ORIGIN` as its audience, and `cronAuth.ts` checks the signature, audience and that the email is `CRON_INVOKER_SA` (JEF-336). Before that, `scheduler.tf` read `CRON_SECRET` into state to set a bearer header.

## First-time setup

You need `gcloud`, Terraform ≥ 1.9, Docker, and owner access to the project and its billing account. Run everything from `infra/gcp/`.

The API goes into the existing **trakwyn** project, ID `job-finder-503217`. gcloud does not start under Python 3.13+; point it at an older interpreter first (`export CLOUDSDK_PYTHON=/usr/bin/python3`).

### 1. Bootstrap (by hand, once)

```bash
export PROJECT_ID=job-finder-503217
export REGION=europe-west1

gcloud auth login
gcloud config set project "$PROJECT_ID"
gcloud billing projects describe "$PROJECT_ID" --format="value(billingEnabled)"   # must print True

# Budget alert: emails billing admins at 50/90/100% of £20 a month. The
# currency must match the billing account's own.
gcloud billing budgets create --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="trakwyn monthly" --budget-amount=20GBP \
  --filter-projects="projects/$PROJECT_ID" \
  --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0

# Terraform state. Versioned, so a bad apply can be recovered from.
gcloud storage buckets create "gs://$PROJECT_ID-tfstate" --location="$REGION" \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets update "gs://$PROJECT_ID-tfstate" --versioning
```

Verify ownership of `trakwyn.com` for the account that will run Terraform, in [Google Search Console](https://search.google.com/search-console). The domain mapping fails without it.

The project isn't new, so check that nothing already uses a name this configuration creates. A clash fails the apply; import the existing resource or rename the new one before going on. An error saying an API is not enabled means nothing of that kind exists yet.

```bash
gcloud iam service-accounts list --format="value(email)"                  # trakwyn-api@, github-deployer@, cron-invoker@
gcloud iam workload-identity-pools list --location=global --format="value(name)"   # .../github
gcloud artifacts repositories list --location="$REGION" --format="value(name)"     # trakwyn
gcloud secrets list --format="value(name)"                                # jwt-secret, cron-secret, ...
gcloud run services list --region="$REGION" --format="value(metadata.name)"        # trakwyn-api
gcloud scheduler jobs list --location="$REGION" --format="value(name)"             # trakwyn-api-*
```

### 2. Configure and create the repository and secret containers

```bash
gcloud auth application-default login
cp terraform.tfvars.example terraform.tfvars      # gitignored; fill it in
terraform init -backend-config="bucket=$PROJECT_ID-tfstate"

terraform apply \
  -target=google_artifact_registry_repository.api \
  -target=google_secret_manager_secret.api
```

The targeted apply comes first because the full apply needs things that don't exist yet: an image to create the service with, and a version of every secret the service references.

### 3. Secrets

Every secret needs a version before Cloud Run will start a revision. The production values already live in the API's production env file, so load them from it rather than by hand. Pull a current copy first — the Vercel dashboard is the source of truth, not whatever file is on disk:

```bash
cd apps/api && vercel env pull .env.production --environment=production && cd -
./load-secrets.sh ../../apps/api/.env.production            # dry run: what it would upload
./load-secrets.sh ../../apps/api/.env.production --apply    # upload
```

The dry run never prints a value. It reports anything missing or left as a placeholder, and exits non-zero until every secret has one. Two are **not** in that file and have to come from their own dashboards: `UPSTASH_REDIS_REST_TOKEN` (Upstash) and `BLOB_PUBLIC_READ_WRITE_TOKEN` (the Vercel Blob store's public-access token — note the app ignores `BLOB_READ_WRITE_TOKEN`, which is the one the file carries). `UPSTASH_REDIS_REST_URL` is not secret and belongs in `terraform.tfvars`.

Secret IDs are the env var names in lower-kebab-case:

| Secret ID                      | Value                                                                                            |
| ------------------------------ | ------------------------------------------------------------------------------------------------ |
| `jwt-secret`                   | copy from the current production config, or sessions are invalidated                             |
| `jwt-refresh-secret`           | copy from the current production config                                                          |
| `totp-encryption-key`          | copy from the current production config, or 2FA secrets can't be read                            |
| `llm-api-key-encryption-key`   | copy from the current production config, or users' AI keys can't be read                         |
| `database-url`                 | Neon **pooled** connection string (host contains `-pooler`), with `?sslmode=require` — see below |
| `upstash-redis-rest-token`     | Upstash token                                                                                    |
| `blob-public-read-write-token` | Vercel Blob store token                                                                          |
| `brevo-api-key`                | Brevo API key                                                                                    |
| `cron-secret`                  | a new random value (`openssl rand -hex 32`); only for triggering the admin routes by hand        |
| `digest-admin-secret`          | a new random value                                                                               |
| `google-oauth-client-secret`   | Google OAuth client secret                                                                       |
| `github-oauth-client-secret`   | GitHub OAuth app secret                                                                          |
| `vapid-private-key`            | copy from the current production config, or push subscriptions break                             |
| `axiom-token`                  | Axiom ingest token                                                                               |

To set one by hand instead:

```bash
printf '%s' "<value>" | gcloud secrets versions add jwt-secret --data-file=-
```

`printf '%s'` rather than `echo`, so no trailing newline becomes part of the secret. To leave a feature unconfigured instead (GitHub sign-in, say), remove its name from `secret_env_vars` in `terraform.tfvars`: Cloud Run refuses to start a revision that references a secret with no version.

**`database-url` is not in the Vercel file.** It is the Neon connection string, which embeds the database password — the reason it is a secret rather than a `terraform.tfvars` value (JEF-342). Use the _pooled_ URL here: every Cloud Run instance keeps its own small `pg` pool, and Neon's pooler multiplexes them all onto the compute. Migrations use the _direct_ URL instead, from CI's `PRODUCTION_DATABASE_URL` secret, because the pooler runs in transaction mode.

```bash
printf '%s' "$NEON_POOLED_URL" | gcloud secrets versions add database-url --data-file=-
```

The one-off move of existing data from Turso is `apps/api/scripts/migrate-turso-to-postgres.ts`; its header lists the order to run it in.

### 4. The first image

Cloud Run runs `linux/amd64`, so build for it explicitly on Apple Silicon. Run this from the repository root:

```bash
gcloud auth configure-docker "$REGION-docker.pkg.dev"
docker build --platform linux/amd64 -f apps/api/Dockerfile \
  -t "$REGION-docker.pkg.dev/$PROJECT_ID/trakwyn/api:bootstrap" .
docker push "$REGION-docker.pkg.dev/$PROJECT_ID/trakwyn/api:bootstrap"
```

Set `initial_image` in `terraform.tfvars` to that tag.

### 5. Everything else

```bash
terraform apply
terraform output
```

### 6. Connect CI

In GitHub → Settings → Secrets and variables → Actions → **Variables** (not secrets; none of these is sensitive):

| Variable           | Value                                              |
| ------------------ | -------------------------------------------------- |
| `GCP_PROJECT_ID`   | `$PROJECT_ID`                                      |
| `GCP_WIF_PROVIDER` | `terraform output -raw workload_identity_provider` |
| `GCP_DEPLOYER_SA`  | `terraform output -raw deployer_service_account`   |

The Vercel API project's secrets (`VERCEL_API_PROJECT_ID`) can be deleted; `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_WEB_PROJECT_ID` are still used by `deploy-web`.

### 7. Smoke-test on the run.app URL

```bash
URL=$(terraform output -raw service_uri)
curl -fsS "$URL/health"
curl -fsS -X POST "$URL/graphql" -H 'content-type: application/json' -d '{"query":"{ __typename }"}'
```

Also check `/mcp` with an API token. Cookie login and chat can't be checked here, because the cookies are scoped to `.trakwyn.com`; those checks come at cutover.

### 8. Cut over

1. `terraform apply -refresh-only && terraform output domain_dns_records`, then create those records at the DNS provider. They replace the records that point `api.trakwyn.com` at Vercel. The managed certificate takes 15 minutes to 24 hours to issue.
2. Once `https://api.trakwyn.com/health` answers from Cloud Run, check that the OAuth callback URLs registered with Google and GitHub are still `https://api.trakwyn.com/auth/oauth/<provider>/callback`. The host hasn't changed, so they should be.
3. Run each scheduled job once and check the responses in Cloud Logging:
   ```bash
   for job in digest-send reminders-send trash-purge; do
     gcloud scheduler jobs run "trakwyn-api-$job" --location="$REGION"
   done
   ```
   This sends the day's digest and reminder emails early. Do it after 09:00 UTC, when they have already gone out for the day, or skip the first two.
4. From `https://www.trakwyn.com`, check password login, TOTP, Google and GitHub sign-in, that a chat reply streams in, and a document upload.
5. Check that traces, logs and metrics arrive in Axiom.
6. Remove the Vercel API project.

## Day two

**Roll back:** send traffic to the previous revision. The next deploy moves traffic back to the newest revision.

```bash
gcloud run revisions list --service=trakwyn-api --region="$REGION"
gcloud run services update-traffic trakwyn-api --region="$REGION" --to-revisions=<revision>=100
```

**Rotate a secret:** add a new version. Running instances keep the value they started with, so roll out a new revision by re-running the latest `deploy-api` job in GitHub Actions. Don't do it with an ad-hoc `gcloud run services update --update-env-vars`, which Terraform would report as drift. The scheduler jobs don't use `cron-secret` — Google mints them a fresh ID token on every run — so rotating it touches nothing else, and there is nothing of theirs to rotate.

**Trigger an admin route by hand:** either run the scheduler job (`gcloud scheduler jobs run trakwyn-api-digest-send --location="$REGION"`), which authenticates exactly as the schedule does, or call the route with `Authorization: Bearer <cron-secret>`. To remove the secret path entirely, drop `CRON_SECRET` and `DIGEST_ADMIN_SECRET` from `secret_env_vars` and apply; the scheduled jobs are unaffected.

**Keep an instance warm:** set `min_instances = 1` in `terraform.tfvars` and apply. This costs about $10 a month more and removes cold starts.

**Cost:** about $1–2 a month at 100 daily users with scale-to-zero. The breakdown is on JEF-335.
