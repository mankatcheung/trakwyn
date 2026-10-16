# infra/vercel: the web app's Vercel project

The Vercel project `apps/web` deploys to, as Terraform (JEF-363): its settings, its domains and its production env vars, plus the two Blob stores the API uploads to (JEF-381, JEF-51). Before this, the same things were steps in a comment at the top of `.github/workflows/ci.yml`, done once in the dashboard and not visible anywhere after.

Terraform owns configuration, CI owns releases, the same split as `infra/gcp`. CI's `deploy-web` job still builds and ships every release (`vercel build` then `vercel deploy --prebuilt --prod`, `.github/actions/vercel-deploy-production`). Nothing here deploys.

## What it owns

| File         | What                                                                                                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `project.tf` | `vercel_project.web` (imported): root directory `apps/web`, and **no git connection**. Connecting the repo would make Vercel deploy every push itself, before CI's tests, alongside `deploy-web`.                                    |
| `domains.tf` | `www.trakwyn.com`, and the apex redirecting to it with a 308 (both imported). Set `apex_domain = null` if the project has no apex.                                                                                                   |
| `env.tf`     | Production env vars `VITE_API_URL`, `VITE_POSTHOG_HOST`, `VITE_POSTHOG_KEY` (read by the browser bundle and, for error reporting, by the Vercel function), and `VITE_TURNSTILE_SITE_KEY` once `turnstile_site_key` is set (JEF-401). |
| `posthog.tf` | Reads `infra/posthog`'s state for the PostHog project key.                                                                                                                                                                           |
| `blob.tf`    | `vercel_blob_store.uploads` (imported, public: avatars) and `vercel_blob_store.documents` (created, private: documents). Their tokens are **not** read here; see "The Blob stores".                                                  |

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

## The Blob stores (JEF-381, JEF-51)

The stores behind `STORAGE_PROVIDER=vercel-blob` are used by the API on Cloud Run, not by this project, so neither has a project connection, and the files in them belong to the app (`@vercel/blob`), not to Terraform.

There are two because a store's access is fixed when it is created:

| Store       | Access  | Holds                                                           | Token                           |
| ----------- | ------- | --------------------------------------------------------------- | ------------------------------- |
| `uploads`   | public  | avatars, which other users see as `<img src>`                   | `BLOB_PUBLIC_READ_WRITE_TOKEN`  |
| `documents` | private | documents and exported PDFs, readable only with the store token | `BLOB_PRIVATE_READ_WRITE_TOKEN` |

Which file goes in which is `storageAccessFor(key)` in `apps/api`: an avatar key (`users/<id>/avatar/…`) is public and everything else is private, so a new kind of file is private unless it opts out. A private blob has no URL anyone can open. The API reads it with the store's token and serves it behind a signed, expiring link (`apps/api/CLAUDE.md`, Storage).

- **Neither store may be replaced.** In this provider, `name`, `access` and `region` all force a replacement, and replacing a store deletes everything in it. `access` and `region` have defaults, so `blob.tf` states all three for both, and `lifecycle.prevent_destroy` makes a plan that would replace a store fail instead.
- **The tokens are not in state.** `infra/gcp/load-secrets.sh` reads `blob_store_id`, `documents_blob_store_id` and `team_id` from this root's outputs, fetches each token from `GET /v1/storage/stores/{id}/secrets`, and pipes it to Secret Manager. Using the `vercel_blob_store_secrets` data source instead would write the tokens into this root's state, and into any root that reads it.
- **`documents` is created here, not imported.** Its region is `blob_store_region`, so the copy between the stores stays in one region; its name is `documents_blob_store_name` (default `trakwyn-documents`).

### Moving documents to the private store (JEF-51)

Documents uploaded before the private store existed are still in `uploads`. The rollout moves them without downtime, and **the order matters**: the API throws for a document operation if its private token is missing, rather than falling back to the public store, and Cloud Run will not start a revision whose secret has no version.

1. **Create the store.** In this root, `terraform plan` must show **1 to add and nothing to change or destroy** (`vercel_blob_store.documents`; `uploads` is untouched), then `apply`. Check the new store is `private` in the Vercel dashboard.
2. **Give the API its token.** In `infra/gcp`: a targeted `terraform apply -target=google_secret_manager_secret.api` creates the empty `blob-private-read-write-token` secret. Then add its one version. Do **not** use `load-secrets.sh --apply` for this: it adds a new version of _every_ secret from the env file, so a stale `.env.production` would overwrite good values. Fetch just this token and pipe it to Secret Manager, the way the script does, so it never lands in a file or the shell history:

   ```bash
   cd infra/vercel && source .envrc
   printf 'Authorization: Bearer %s\n' "$TF_VAR_vercel_api_token" |
     curl -sS --fail -H @- "https://api.vercel.com/v1/storage/stores/$(terraform output -raw documents_blob_store_id)/secrets?teamId=$(terraform output -raw team_id)" |
     jq -er .rwToken |
     tr -d '\n' |
     gcloud secrets versions add blob-private-read-write-token --data-file=-
   ```

   Then a full `terraform apply` in `infra/gcp` adds the env var to the service. Read its plan first: it should be the new secret's IAM binding and a Cloud Run revision with the extra env var, and nothing else. The running revision ignores the variable until the new one takes traffic.

3. **Merge the PR.** CI deploys web and the API. The web build sends `access: 'private'` for a document only when the API says so, and an API that says nothing gets `public`, so the order they land in does not matter for reads. There is one short window: an old web build against the new API cannot upload a document (its `put()` says `public`, the token is for the private store) and shows the usual upload error. `deploy-web` normally finishes before `deploy-api`, which waits for the migrations. Retrying the upload works once web has landed.
4. **Check new uploads and exports go private.** Upload a PDF and open it from the preview; export a draft to PDF. In the Vercel dashboard the new objects should be in `documents`, and `uploads` should have gained nothing. Existing documents still open: a read that finds nothing in `documents` falls back to `uploads`.
5. **Copy the existing documents.** From `apps/api` with both tokens in the environment (`vercel env pull`, or `source` them):

   ```bash
   pnpm blob:copy-documents                   # dry run: counts only
   pnpm blob:copy-documents --apply           # copy; the public copies stay
   ```

   It keeps every pathname, so no `storageKey` in the database changes. It is safe to run again and to interrupt: a blob already in `documents` with the same size is skipped, a copy counts only once `documents` reports the size that was read, and a failure on one blob is reported without stopping the rest. It exits non-zero if anything failed. Run it until it reports `copied: 0` and `failed: 0`. Avatars are never touched.

6. **Check a few documents** from before the copy still open in the app.
7. **Delete the public copies.** This is the step that makes the old URLs stop working, so it is the one that closes the gap JEF-51 is about: any document URL that leaked before this stays valid until it runs.

   ```bash
   pnpm blob:copy-documents --apply --delete-public
   ```

   It removes a blob from `uploads` only after confirming it is in `documents` at the same size. Afterwards, confirm in the dashboard that `uploads` holds only `users/<id>/avatar/…` objects.

8. **Clean up (done).** The public fallback in `VercelBlobStorageProvider.getObject` and the copy script (`pnpm blob:copy-documents`) are removed, and `deleteMany` now removes each key only from the store it lives in. The steps above are kept as the record of how the move was done; the script is in git history before JEF-51's clean-up PR.

To roll back before step 7, redeploy the previous API image: the public copies are intact and the old provider reads them. The exception is anything uploaded or exported since step 3, which exists only in `documents` and which the old image cannot read; run the copy in reverse by hand, or accept losing sight of those until the roll-forward. After step 7 every document exists only in `documents`.

### Adopting the Blob store

Find the store's ID, name and region:

```bash
curl -s -H "Authorization: Bearer $TF_VAR_vercel_api_token" \
  "https://api.vercel.com/v1/storage/stores?teamId=<team_id>" \
  | jq '.stores[] | select(.type == "blob") | {id, name, region, access}'
```

Put `id`, `name` and `region` in `terraform.tfvars` as `blob_store_id`, `blob_store_name` and `blob_store_region`, and check that `access` is `public`. Then `plan`. It must show **1 to import and 0 to add, change or destroy** for the store. A `prevent_destroy` error means one of the three values differs from the live store: fix the value, don't remove the guard.

Before loading the token into Secret Manager for the first time, compare its first characters with the current `blob-public-read-write-token` without printing either value:

```bash
source .envrc
curl -s -H @- "https://api.vercel.com/v1/storage/stores/$(terraform output -raw blob_store_id)/secrets?teamId=$(terraform output -raw team_id)" \
  <<<"Authorization: Bearer $TF_VAR_vercel_api_token" | jq -r .rwToken | cut -c1-24
gcloud secrets versions access latest --secret=blob-public-read-write-token | cut -c1-24
```

Both should start with `vercel_blob_rw_` and the same store ID. Then run `load-secrets.sh` (`infra/gcp/README.md`, step 3) and roll out a new revision.

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
