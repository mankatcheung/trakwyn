# infra/upstash: the production Redis database

The Upstash Redis database `apps/api` uses in production (`CACHE_PROVIDER=redis`), as Terraform (JEF-378). It backs the cache-aside layer, the rate limiter and the session blocklist (JEF-127, JEF-164). Before this it was created by hand in the Upstash console, and nothing recorded its region, eviction policy or budget.

## What it owns

| File         | What                                                                                                                  |
| ------------ | --------------------------------------------------------------------------------------------------------------------- |
| `redis.tf`   | `upstash_redis_database.this`: TLS on, eviction off, no auto-upgrade. The budget is left to the console (free tier).  |
| `outputs.tf` | `rest_url`, the value of `UPSTASH_REDIS_REST_URL`, which `infra/gcp` takes as its `upstash_redis_rest_url` (literal). |

Things worth knowing:

- **Eviction is off on purpose.** Every key the API writes has a TTL, so memory is already bounded. With eviction on, a full database would drop keys early, and a dropped session-blocklist key silently un-revokes that session until its access token expires. With it off, a full database fails writes instead, and the cache, rate limiter and blocklist all fail open and count it (`apps/api/CLAUDE.md`, Metrics), which `infra/axiom`'s monitors alert on.
- **It stays on the free tier.** `auto_scale = false` means hitting a quota (the monthly command cap is the likely one) throttles the database rather than moving it to a paid plan. Throttling looks like Redis errors, so the same fail-open monitors are the signal. `budget` is a pay-as-you-go setting, so it is in `ignore_changes` rather than the config: Terraform never sets or clears it. If the database ever moves to pay-as-you-go, set the budget in `redis.tf` and take it out of `ignore_changes` in the same PR.
- **No IP allowlist.** Cloud Run has no fixed egress IP (there is no NAT gateway in `infra/gcp`), so an allowlist would lock the API out. The REST token is the only boundary.
- **Identity lives in `terraform.tfvars`, policy in `redis.tf`.** The name and region are facts about the one database that exists, so they sit next to its import ID, like `zone_id` in `infra/cloudflare`. The settings in `redis.tf` are decisions, so they are reviewed in the repo.
- **`prevent_destroy` is set.** Changing `database_name` or `region` makes the provider replace the database, which would drop every key and change the token Cloud Run holds. `plan` refuses instead. To really move the database, see "Replacing the database" below.

## Credentials in state

**This root breaks the rule `infra/gcp` follows, that secrets never enter state.** The provider stores the database's `password`, `rest_token` and `read_only_rest_token` as computed attributes of `upstash_redis_database`, and there is no way to switch that off. They are marked sensitive, so `plan` and `output` don't print them, but the state object `trakwyn/upstash/default.tfstate` holds them in plain text.

This is accepted because of who can already read that object. The state bucket is private, uniform-access and not public (`infra/gcp/README.md`, Bootstrap), and anyone with read access to it also has read access to Secret Manager's `upstash-redis-rest-token`, which holds the same token. Keep it that way: don't grant anyone access to the bucket, or to this prefix, that you wouldn't grant to that secret.

It is also why `infra/gcp` does not read `rest_url` through `terraform_remote_state`, as `infra/vercel` does with `infra/posthog`. That would give `infra/gcp`'s runner read access to this state, credentials included.

## Why a separate root

For the same reason as `infra/axiom`, `infra/cloudflare`, `infra/posthog` and `infra/vercel`: the provider credential is a provider argument, Terraform never writes provider arguments to state, and a separate root keeps it out of every other root's `apply`. It matters more here than for the others: the Upstash management key cannot be scoped to one database. It can create, read and delete every database in the account.

State lives in the same GCS bucket under prefix `trakwyn/upstash`.

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and an Upstash management API key.

Create the key in the Upstash console under **Account → Management API → Create API Key**. It is account-wide, so treat it like a root password: keep it only in `.envrc`, and delete it in the console when you're done if you don't apply often.

```bash
cd infra/upstash
cp terraform.tfvars.example terraform.tfvars      # name and region; gitignored
cp .envrc.example .envrc && chmod 600 .envrc      # set the email and key; gitignored
source .envrc                                     # or let direnv load it
terraform init -backend-config="bucket=job-finder-503217-tfstate"
terraform plan
terraform apply
```

CI only runs `fmt` and `validate` on this root. `plan` and `apply` are run by hand.

### Adopting the live database

List the account's databases, with the credentials stripped out:

```bash
curl -s -u "$TF_VAR_upstash_email:$TF_VAR_upstash_api_key" \
  https://api.upstash.com/v2/redis/databases \
  | jq '.[] | del(.password, .rest_token, .read_only_rest_token)'
```

The production one is the one whose `endpoint` is the host in `infra/gcp`'s `upstash_redis_rest_url`. Copy its `database_name`, `region`, and for a global database its `primary_region` and `read_regions`, into `terraform.tfvars`, and its `database_id` into `database_import_id`.

Then `plan` and read it before applying. It must show **one import, no create and no destroy**. A `prevent_destroy` error means `database_name` or `region` doesn't match the live database; fix `terraform.tfvars`, don't remove the lifecycle rule. These in-place updates are the only ones to expect:

- **`eviction`, `auto_scale`, `prod_pack` or `tls`**, when the live database was set differently. Each is a real change to production, so decide rather than accept it: apply it if the setting in `redis.tf` is what you want (it's argued for above), or copy the live value into `redis.tf` in a PR first. TLS cannot be turned off on Upstash, so a `tls` change can only be `true` being recorded.

Anything else is unexpected; find out why before applying.

Once the plan shows only changes you mean, `apply`, then set `database_import_id` back to `null`. The import block does nothing once the database is in state, but the ID is only needed once.

## After applying

1. `terraform output rest_url` matches `upstash_redis_rest_url` in `infra/gcp`'s `terraform.tfvars`. If not, you imported the wrong database.
2. `https://api.trakwyn.com/health` answers, and signing in and out at `https://www.trakwyn.com` works (the rate limiter and the session blocklist are on those paths).
3. In Axiom, the Redis fail-open and circuit-breaker counters (`infra/axiom/monitors.tf`) show no rise over the next hour.
4. A second `terraform plan` shows no changes.

## Replacing the database

Moving to another region, or recreating the database, is a planned migration, not an apply:

1. Remove `prevent_destroy` in a PR that says why.
2. `apply`. Every cached value, rate-limit window and revoked-session entry is lost. The cache refills, rate limits reset (a burst gets through) and revoked sessions work again until their access tokens expire, at most 15 minutes. Do it when that is acceptable.
3. Put the new `rest_url` into `infra/gcp`'s `upstash_redis_rest_url`, and the new token into Secret Manager: `terraform state show upstash_redis_database.this` doesn't print it, so copy it from the Upstash console, then `printf '%s' "<token>" | gcloud secrets versions add upstash-redis-rest-token --data-file=-`.
4. `terraform apply` in `infra/gcp`, then re-run the latest `deploy-api` job so a new revision picks up the token (`infra/gcp/README.md`, Day two).
5. Put `prevent_destroy` back.
