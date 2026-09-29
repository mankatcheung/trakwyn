# infra/neon: the production Postgres branch

The production branch, its read-write compute and the API's database on Neon, as Terraform (JEF-379). Neon has hosted production since JEF-342, in `aws-eu-central-1` (Frankfurt). Before this, its compute sizing, suspend timeout and branch protection were set in the dashboard, and nothing recorded what they were meant to be.

Terraform owns configuration. It never touches data, the schema (that is `apps/api`'s migrations) or credentials.

## What it owns

| File          | What                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `branch.tf`   | `neon_branch.production` (imported): the project's default branch, its name and whether it is protected.                                                               |
| `endpoint.tf` | `neon_endpoint.production` (imported): the branch's read-write compute: a fixed 0.25 CU, suspended after Neon's default 5 minutes idle (Free plan). Checks the region. |
| `database.tf` | `neon_database.app` (imported): the API's database and the role that owns it.                                                                                          |
| `outputs.tf`  | The direct and pooled hosts, and the region. No credentials.                                                                                                           |

All three resources have `prevent_destroy`. A plan that would destroy or replace one fails instead of being applied. Replacing the branch or the database loses production's data. Replacing the endpoint gives it a new host, which breaks both connection strings until they are set again.

Things worth knowing:

- **Production is on Neon's Free plan, and the code matches it.** The compute is a fixed 0.25 CU (`autoscaling_limit_min_cu = autoscaling_limit_max_cu`). `suspend_timeout_seconds = 0` means "Neon's default", which is 5 minutes on Free and cannot be changed there. The branch is not protected, because protected branches need a paid plan. After an upgrade, raise `autoscaling_limit_max_cu`, set an explicit timeout if you want one, and set `protect_branch = true`.
- **The 5-minute suspend is relied on elsewhere.** `infra/axiom`'s pool-error monitor is tested by letting an instance sit idle past it, and the API's pool `'error'` handler exists because of it (`apps/api/CLAUDE.md`, Database). Change them together.
- **There is no pooler setting.** Neon pools every endpoint. `host_pooling` is the `-pooler` host that the API's `database-url` must use; `host` is the direct one that migrations use (`infra/gcp/README.md`, §3).
- **The region is checked, not set.** A project's region is fixed when it is created. The endpoint's postcondition fails the plan if the compute is not in `var.region`. That happens only if `project_id` or `endpoint_id` points at the wrong project.

## Why there is no `neon_project`

`kislerdm/neon`'s `neon_project` resource reads the default database owner's live password on every refresh, not only at creation. It then writes that password, and `connection_uri`/`connection_uri_pooler` built from it, into state. That role is the one the API connects as. Managing the project would put production's database password in the state bucket, against the rule `infra/gcp` follows, that secrets never enter Terraform state. `infra/upstash` breaks that rule knowingly, because its provider leaves no alternative (`infra/upstash/README.md`, "Credentials in state"). Here there is one: `neon_branch`, `neon_endpoint` and `neon_database` read no credentials, so leaving the project out keeps this root's state free of secrets.

So the project itself is referenced by `project_id` and not managed. These stay in the dashboard, under the project's **Settings**:

- the Postgres version and region (both fixed at creation)
- history retention (the point-in-time restore window)
- the IP allow list and public-network settings
- the project name

Roles are not managed either. `neon_role` stores the role's password in state for the same reason.

If the provider ever stops reading the password on refresh, `neon_project` can be imported here and these settings moved in.

## Why a separate root

For the same reason as `infra/axiom`, `infra/brevo`, `infra/cloudflare`, `infra/posthog`, `infra/upstash` and `infra/vercel`: the Neon API key is a provider argument, Terraform never writes provider arguments to state, and a separate root keeps it out of every other root's `apply`. State lives in the same GCS bucket under prefix `trakwyn/neon`.

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and a Neon API key.

Create the key under **Account settings → API keys** (a personal key), or under the organization's **Settings → API keys** if the project belongs to one. Give it an expiry and use it for nothing else, so it can be revoked on its own.

```bash
cd infra/neon
cp terraform.tfvars.example terraform.tfvars      # project_id, branch_id, endpoint_id
cp .envrc.example .envrc && chmod 600 .envrc      # set the key; gitignored
source .envrc                                     # or let direnv load it
terraform init -backend-config="bucket=job-finder-503217-tfstate"
terraform plan
terraform apply
```

The IDs are in the console:

- `project_id` is under **Settings → General**.
- `branch_id` is on the default branch's page, under **Branches**.
- `endpoint_id` is the `ep-…` at the start of the host in either connection string. The pooled host has `-pooler` after it.

Or list them with the API:

```bash
curl -s -H "Authorization: Bearer $TF_VAR_neon_api_key" \
  "https://console.neon.tech/api/v2/projects/<project_id>/branches" \
  | jq '.branches[] | select(.default) | {id, name, protected}'
curl -s -H "Authorization: Bearer $TF_VAR_neon_api_key" \
  "https://console.neon.tech/api/v2/projects/<project_id>/endpoints" \
  | jq '.endpoints[] | {id, branch_id, type, host, region_id, autoscaling_limit_min_cu, autoscaling_limit_max_cu, suspend_timeout_seconds}'
```

CI only runs `fmt` and `validate` on this root. `plan` and `apply` are run by hand.

### Adopting the live project

Every resource has an `import` block, so the first `plan` adopts them. Read it before applying. It must show **three imports and no create, replace or destroy**. A create means an ID or a name in `terraform.tfvars` is wrong; `prevent_destroy` stops a replace from being planned at all.

On the Free plan, with the defaults, the plan should be imports only: `3 to import, 0 to add, 0 to change, 0 to destroy`. Otherwise, expect in-place updates only where production differs from the code:

- **`protected`** going to `"yes"`, if you set `protect_branch = true` and the branch was not protected yet. That is intended, and fails on the Free plan.
- **`pg_settings`** being cleared, if the compute has custom Postgres settings. `endpoint.tf` declares none. Copy them into a `pg_settings` map there rather than applying.
- **`autoscaling_limit_*` or `suspend_timeout_seconds`**, if the dashboard holds different values. Decide which one is right. To keep the live value, copy it into `endpoint.tf` and plan again.
- **`name`** on the branch, or **`owner_name`** on the database, if a default is wrong. Set `branch_name` or `database_owner` in `terraform.tfvars` rather than renaming anything.

Once the plan shows only the changes you mean, `apply`.

## Day two

- **Change compute sizing or the suspend timeout:** edit `endpoint.tf`, then `plan` and `apply`. Compute changes apply without downtime. On the Free plan the timeout cannot be changed; check the plan's compute limits before raising the size.
- **Roll back:** revert the commit and apply again. Every setting here changes in place and none of them touches data.
- **Rotate the database password:** in the dashboard, under **Roles**. Then update `database-url` (`infra/gcp/README.md`, "Rotate a secret") and CI's `PRODUCTION_DATABASE_URL`. This root is unaffected, since it never reads the password.
- **Restore from history:** use the dashboard's point-in-time restore onto a new branch, or a reset of this one. A reset keeps the branch ID, so state stays valid. A restore that makes a different branch the default needs `branch_id` and `endpoint_id` updated, and the old resources removed from state with `terraform state rm` before the new ones are imported.
