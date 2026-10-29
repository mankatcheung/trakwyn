# infra/gcp: the API on Google Cloud Run

Terraform for everything `apps/api` needs on Google Cloud (JEF-335). `apps/web` stays on Vercel. The database is Neon Postgres in `aws-eu-central-1` (Frankfurt) since JEF-342; it, Upstash, Vercel Blob, Brevo and Axiom are reached over the internet.

| File                   | What it declares                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| `apis.tf`              | The Google APIs the rest depends on                                                                    |
| `artifact_registry.tf` | Docker repository `trakwyn`, keeping the five newest images                                            |
| `secrets.tf`           | One Secret Manager secret per sensitive env var, containers only                                       |
| `iam.tf`               | Runtime service account (reads its secrets), CI's deployer account, and the scheduler's `cron-invoker` |
| `chrome_web_store.tf`  | The service account the Clipper release job uploads to the Chrome Web Store as (JEF-419)               |
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

The dry run never prints a value. It reports anything missing or left as a placeholder, and exits non-zero until every secret has one. `UPSTASH_REDIS_REST_TOKEN` is **not** in that file and has to come from the Upstash dashboard. `UPSTASH_REDIS_REST_URL` is not secret and belongs in `terraform.tfvars`, copied from `terraform -chdir=../upstash output -raw rest_url`. The database itself is Terraform in `infra/upstash` (JEF-378). Its value is copied rather than read across roots, because reading that root's state would also read the Redis credentials it holds (`infra/upstash/README.md`).

`BLOB_PUBLIC_READ_WRITE_TOKEN` and `BLOB_PRIVATE_READ_WRITE_TOKEN` are never read from the file. The script fetches each from the Vercel API for the Blob stores `infra/vercel` manages (JEF-381, JEF-51), using that root's `blob_store_id` (avatars, public), `documents_blob_store_id` (documents, private) and `team_id` outputs, and pipes it straight to Secret Manager. So apply `infra/vercel` first, and run the script with `TF_VAR_vercel_api_token` set (`source ../vercel/.envrc`). The tokens stay out of Terraform state on purpose: the provider's `vercel_blob_store_secrets` data source would have written them into state.

**Adding the private store to a running service** is a rollout with an order, because Cloud Run will not start a revision whose secret has no version: `infra/vercel/README.md`, "Moving documents to the private store".

Secret IDs are the env var names in lower-kebab-case:

| Secret ID                       | Value                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `jwt-secret`                    | copy from the current production config, or sessions are invalidated                                                                        |
| `jwt-refresh-secret`            | copy from the current production config                                                                                                     |
| `totp-encryption-key`           | copy from the current production config, or 2FA secrets can't be read                                                                       |
| `llm-api-key-encryption-key`    | copy from the current production config, or users' AI keys can't be read                                                                    |
| `database-url`                  | Neon **pooled** connection string (host contains `-pooler`), with `?sslmode=require` — see below                                            |
| `upstash-redis-rest-token`      | Upstash token                                                                                                                               |
| `blob-public-read-write-token`  | fetched from Vercel by `load-secrets.sh` for `infra/vercel`'s public Blob store (avatars)                                                   |
| `blob-private-read-write-token` | fetched from Vercel by `load-secrets.sh` for `infra/vercel`'s private Blob store (documents)                                                |
| `brevo-api-key`                 | Brevo API key (not the one `infra/brevo` uses)                                                                                              |
| `turnstile-secret-key`          | Cloudflare Turnstile secret key (the widget's server half; `terraform output -raw turnstile_secret_key` in `infra/cloudflare`)              |
| `polar-access-token`            | Polar organization access token for the environment `POLAR_SERVER` names. Added by hand, not by `load-secrets.sh` (`infra/polar/README.md`) |
| `polar-webhook-secret`          | the `whsec_…` secret of that environment's Polar webhook endpoint. Added by hand, not by `load-secrets.sh` (`infra/polar/README.md`)        |
| `cron-secret`                   | a new random value (`openssl rand -hex 32`); only for triggering the admin routes by hand                                                   |
| `digest-admin-secret`           | a new random value                                                                                                                          |
| `google-oauth-client-secret`    | Google OAuth client secret                                                                                                                  |
| `github-oauth-client-secret`    | GitHub OAuth app secret                                                                                                                     |
| `vapid-private-key`             | copy from the current production config, or push subscriptions break                                                                        |
| `axiom-token`                   | Axiom ingest token                                                                                                                          |

To set one by hand instead:

```bash
printf '%s' "<value>" | gcloud secrets versions add jwt-secret --data-file=-
```

`printf '%s'` rather than `echo`, so no trailing newline becomes part of the secret. To leave a feature unconfigured instead (GitHub sign-in, say), remove its name from `secret_env_vars` in `terraform.tfvars`: Cloud Run refuses to start a revision that references a secret with no version.

**`database-url` is not in the Vercel file.** It is the Neon connection string, which embeds the database password — the reason it is a secret rather than a `terraform.tfvars` value (JEF-342). Use the _pooled_ URL here: every Cloud Run instance keeps its own small `pg` pool, and Neon's pooler multiplexes them all onto the compute. Migrations use the _direct_ URL instead, from CI's `PRODUCTION_DATABASE_URL` secret, because the pooler runs in transaction mode. `infra/neon` manages the branch and compute behind both and outputs the two hosts (`host_pooling`, `host`), but it never reads the password, so both URLs are still set by hand (JEF-379).

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
| `GCP_CI_READER_SA` | `terraform output -raw ci_reader_service_account`  |

The Vercel API project's secrets (`VERCEL_API_PROJECT_ID`) can be deleted; `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_WEB_PROJECT_ID` are still used by `deploy-web`.

### 7. Smoke-test on the run.app URL

```bash
URL=$(terraform output -raw service_uri)
curl -fsS "$URL/health"
curl -fsS -X POST "$URL/graphql" -H 'content-type: application/json' -d '{"query":"{ __typename }"}'
```

Also check `/mcp` with an API token. Cookie login and chat can't be checked here, because the cookies are scoped to `.trakwyn.com`; those checks come at cutover.

### 8. Cut over

1. `terraform apply -refresh-only && terraform output domain_dns_records`, then check them against the `api` entry in `infra/cloudflare/dns.tf` and apply that root if they differ. Don't edit the record in the Cloudflare dashboard; Terraform owns it (JEF-371). The managed certificate takes 15 minutes to 24 hours to issue.
2. Once `https://api.trakwyn.com/health` answers from Cloud Run, check that the OAuth callback URLs registered with Google and GitHub are still `https://api.trakwyn.com/auth/oauth/<provider>/callback`. The host hasn't changed, so they should be.
3. Run each scheduled job once and check the responses in Cloud Logging:
   ```bash
   for job in digest-send reminders-send trash-purge account-purge; do
     gcloud scheduler jobs run "trakwyn-api-$job" --location="$REGION"
   done
   ```
   This sends the day's digest and reminder emails early. Do it after 09:10 UTC, when they have already gone out for the day, or skip the first two.
4. From `https://www.trakwyn.com`, check password login, TOTP, Google and GitHub sign-in, that a chat reply streams in, and a document upload.
5. Check that traces, logs and metrics arrive in Axiom.
6. Remove the Vercel API project.

### Base images (JEF-406)

CI builds and tests on `node` and `postgres`. Pulling them anonymously from a public registry fails with `429` when other runners on the same IP have used up its limit, so they are copied once into this project's own `base-images` repository and pulled from there. `terraform apply` creates the repository and grants the deployer service account write access to it; nothing else is needed on the GitHub side, because the `GCP_*` variables above are the ones the mirror uses.

`infra/base-images.txt` pins each image by tag and digest. The `Mirror base images` workflow copies exactly those digests into the repository and fails if a copy does not keep its digest. It runs when the file changes on `main`, on demand (Actions → Mirror base images → Run workflow) and weekly. It runs on `main` only, because it writes with the deployer account and Workload Identity Federation only lets `main` act as that.

**Who may pull (JEF-407):** CI pulls the mirrored `node` and `postgres` through the `./.github/actions/base-images` action, which logs in to Artifact Registry and exports `NODE_IMAGE` and `POSTGRES_IMAGE` from the pin file. Pull-request jobs (`api-image`, `e2e`) act as `github-ci-reader`, which holds `artifactregistry.reader` on `base-images` and no other role. The provider admits pull-request tokens (`refs/pull/*`) for this repository, but only `main` may impersonate `github-deployer`, so a pull request cannot push images or deploy. `deploy-api` builds on the same mirrored `node` image with its own deployer login. Fork pull requests get no OIDC token from GitHub and cannot log in; that is accepted for a single-contributor repo.

**Egress (JEF-474):** every pull from the registry to a GitHub runner is billed as internet egress, and the repository's only Artifact Registry charge was that. The `e2e` job passes `preload: postgres` to the action, which keeps a `docker save` tarball in the Actions cache keyed on `infra/base-images.txt`; a run with an unchanged pin loads it and neither logs in nor pulls. The `node` image is only handed to buildx, which cannot see the runner's Docker images, so those jobs still log in and rely on the `type=gha,mode=max` layer cache. If the egress SKU stays high after this, that is where to look next.

**Rolling out a change to these bindings:** a pull request's CI uses the workflow from the pull request, so apply Terraform and set `GCP_CI_READER_SA` before merging JEF-407, or its own `api-image` and `e2e` jobs cannot log in.

**First fill:** after the first `terraform apply`, run the workflow once and check that both images are there:

```bash
gcloud artifacts docker images list "$REGION-docker.pkg.dev/$PROJECT_ID/base-images" --include-tags
```

**Bump an image:** Renovate opens a PR that changes a digest in `infra/base-images.txt` (it needs the Renovate GitHub app on the repository; `renovate.json` tells it how to read the file). Merge it first: the mirror runs on `main`, and the next CI run uses the new digest. A bump PR's own CI would pull a digest that is not mirrored yet, so expect it to fail until the mirror has run. To bump by hand, change the line and merge; to get a digest, `docker buildx imagetools inspect <source>:<tag>`. Keep the `node` tag in step with `NODE_VERSION` in `apps/api/Dockerfile`; `baseImages.test.ts` fails when they differ.

**If the mirror is unavailable:** there is no fallback to a public registry, so CI results stay reproducible. Re-run **Mirror base images**; copies are idempotent and keep their progress between attempts.

## Day two

**Rotate the Web Store key (JEF-419):** the Clipper release job authenticates to the Chrome Web Store as `chrome-web-store-publisher`, the one account here with a JSON key, because that API cannot use Workload Identity Federation. The key is not in Terraform, so it is not in state. After the first apply, add `terraform output -raw chrome_web_store_service_account` as a user in the Web Store dashboard (Account) and set the secrets of the `chrome` environment as `apps/extension/CLAUDE.md` describes. To rotate:

```bash
SA=$(terraform output -raw chrome_web_store_service_account)
gcloud iam service-accounts keys create /dev/stdout --iam-account="$SA" \
  | jq -r .private_key | gh secret set CHROME_SERVICE_ACCOUNT_PRIVATE_KEY --env chrome
gcloud iam service-accounts keys list --iam-account="$SA"   # then delete the old one:
gcloud iam service-accounts keys delete <old-key-id> --iam-account="$SA"
```

**Roll back:** send traffic to the previous revision. The next deploy moves traffic back to the newest revision.

```bash
gcloud run revisions list --service=trakwyn-api --region="$REGION"
gcloud run services update-traffic trakwyn-api --region="$REGION" --to-revisions=<revision>=100
```

**Switch the email-verification wall off (JEF-438):** if the wall is locking people out (the verification email is not arriving, or a launch left too many accounts behind it), set `EMAIL_VERIFICATION_REQUIRED = "false"` in `plain_env` in `terraform.tfvars` and apply. The API then stops refusing unverified accounts and reports every user as verified, so web and mobile show no reminder; nothing is deleted or changed in the database. Remove the line and apply to switch it back on. This is a new revision, so allow a minute. Use this, not `gcloud run services update --update-env-vars`, which Terraform would report as drift. To release the accounts that are stuck for good, run `pnpm --filter @trakwyn/api email-verification backfill --before <date> --dry-run` first (it writes the database directly, as `plan` does; see `apps/api/CLAUDE.md`). `AUTO_VERIFY_EMAIL = "true"` is the narrower lever: it only stops new sign-ups from needing a link.

**Rotate a secret:** add a new version. Running instances keep the value they started with, so roll out a new revision by re-running the latest `deploy-api` job in GitHub Actions. Don't do it with an ad-hoc `gcloud run services update --update-env-vars`, which Terraform would report as drift. The scheduler jobs don't use `cron-secret` — Google mints them a fresh ID token on every run — so rotating it touches nothing else, and there is nothing of theirs to rotate.

**Trigger an admin route by hand:** either run the scheduler job (`gcloud scheduler jobs run trakwyn-api-digest-send --location="$REGION"`), which authenticates exactly as the schedule does, or call the route with `Authorization: Bearer <cron-secret>`. To remove the secret path entirely, drop `CRON_SECRET` and `DIGEST_ADMIN_SECRET` from `secret_env_vars` and apply; the scheduled jobs are unaffected.

**Keep an instance warm:** set `min_instances = 1` in `terraform.tfvars` and apply. This costs about $10 a month more and removes cold starts.

Production stays at `min_instances = 0` (JEF-457, decided 2026-10-27). The Clipper popup was the most visible cost of a cold start, because it held a spinner until the API answered. Since JEF-457 the popup shows the parsed clip before any request, so a cold start now delays only the header and the Save button. A warm request takes about 80 ms from the client. Revisit this if the popup's `popup:account-confirmed` timing (`apps/extension/CLAUDE.md`, "Popup startup") or web's first load after an idle spell is still slow enough to complain about.

**Cost:** about $1–2 a month at 100 daily users with scale-to-zero. The breakdown is on JEF-335.
