# infra/cloudflare: the trakwyn.com zone

The DNS records, zone settings and email forwarding rules for `trakwyn.com`, as Terraform (JEF-371). Cloudflare is the zone's DNS host (nameservers `david` and `crystal.ns.cloudflare.com`). Before this, records were added by hand in the dashboard, including the ones `infra/vercel` and `infra/gcp` depend on, and nothing recorded what was supposed to be there.

## What it owns

| File               | What                                                                                                                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dns.tf`           | Every record except Email Routing's: the apex and `www` (Vercel), `api` (Cloud Run), Brevo's DKIM CNAMEs and DMARC, and the Brevo and Google verification TXTs. |
| `zone_settings.tf` | SSL mode Full (strict), Always Use HTTPS, minimum TLS 1.2. Imported unconditionally.                                                                            |
| `email_routing.tf` | Email Routing forwarding rules (`address@trakwyn.com` → a verified inbox), defined in `terraform.tfvars` as `email_routing_rules`.                              |

Things worth knowing:

- **Nothing is proxied.** Every record is `proxied = false` (grey cloud). Vercel and the Cloud Run domain mapping each issue their own certificate and expect traffic to reach them directly. Proxying `api` would also put Cloudflare between the browser and the auth cookies (root `CLAUDE.md`, Auth). If you ever turn it on for a record, the zone settings already stop it falling back to flexible SSL.
- **Zone settings do nothing today** for the same reason: they only act on proxied traffic. They are pinned so that stays true if a record is proxied later.
- **Values are literals, not read from other roots.** The `api` target, `ghs.googlehosted.com`, is the same for every Cloud Run domain mapping, and `infra/gcp`'s `domain_dns_records` output is empty until the mapping is provisioned. The `www` target is specific to the Vercel project and comes from its domain settings page; `infra/vercel` does not output it. Reading either across roots would couple apply order for a value that does not change.
- **A record removed from `dns.tf` is deleted from the zone** on the next apply. A record added in the dashboard is invisible to Terraform and never reported; add it to `local.records` to manage it. The same goes for a rule removed from, or never added to, `email_routing_rules`.
- **Forwarding rules live in `terraform.tfvars`, not in a `.tf` file,** because each one names a personal inbox. The file is gitignored, so it is the one piece of this root's configuration that exists only on the machine that applies it. Keep a copy somewhere you would find it again.

## What it does not own

**Email Routing's records:** the three `routeN.mx.cloudflare.net` MX records, the `v=spf1 include:_spf.mx.cloudflare.net ~all` TXT on the apex, and the `cf2024-1._domainkey` DKIM TXT. Email Routing creates them when it is enabled, and marks them locked in the dashboard as its own. Managing them here would give the same records two owners. They go away with Email Routing, under **Email → Email Routing → Settings**.

**Email Routing's destination addresses and catch-all.** Destination addresses belong to the Cloudflare account, not the zone, and each needs a click in a verification email, so managing them would widen the token to account scope for something that cannot finish unattended. Add and verify one under **Email → Email Routing → Destination addresses** before using it as a rule's `forward_to`. The catch-all (mail to any other address) keeps whatever the dashboard says.

Also out of scope: the registrar and nameservers, WAF, rate limiting, caching rules, Workers and Pages.

## Why a separate root

For the same reason as `infra/axiom`, `infra/posthog` and `infra/vercel`: the Cloudflare token is a provider argument, Terraform never writes provider arguments to state, and a separate root keeps it out of every other root's `apply`. State lives in the same GCS bucket under prefix `trakwyn/cloudflare`.

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and a Cloudflare API token.

Create the token under **My Profile → API Tokens → Create Token → Custom token**, with:

- **Permissions:** Zone · Zone · Read, Zone · DNS · Edit, Zone · Zone Settings · Edit, Zone · Email Routing Rules · Edit
- **Zone Resources:** Include · Specific zone · `trakwyn.com`
- a TTL (expiry)

```bash
cd infra/cloudflare
cp terraform.tfvars.example terraform.tfvars      # zone_id; gitignored
cp .envrc.example .envrc && chmod 600 .envrc      # set the token; gitignored
source .envrc                                     # or let direnv load it
terraform init -backend-config="bucket=job-finder-503217-tfstate"
terraform plan
terraform apply
```

`zone_id` is on the zone's **Overview** page, bottom right, under **API**.

CI only runs `fmt` and `validate` on this root. `plan` and `apply` are run by hand.

### Adopting the live zone

Zone settings always exist and import on their own. Records need their Cloudflare IDs, which are only in the API. List every record in the zone:

```bash
curl -s -H "Authorization: Bearer $TF_VAR_cloudflare_api_token" \
  "https://api.cloudflare.com/client/v4/zones/<zone_id>/dns_records?per_page=100" \
  | jq -r '.result[] | [.id, .type, .name, .ttl, .proxied, .content] | @tsv'
```

Match each row to a key of `local.records` in `dns.tf` and put its ID in `record_import_ids` in `terraform.tfvars`. Then check the list against `dns.tf` both ways:

- **A row with no key**, other than Email Routing's: add it to `local.records` (and its ID to the map), or delete it in the dashboard if it is dead.
- **A key with no row**: the live zone has drifted from what this root was written from. Find out why before applying, because applying creates the record.

Then `plan` and read it before applying. It must show **no create and no destroy**, only imports and at most these in-place updates:

- **`ttl`**, when the live record is not Auto (1). Copy the live value into that record in `local.records` rather than changing DNS as part of adoption.
- **TXT `content` differing only in quotes.** Records entered before Cloudflare started quoting TXT content come back unquoted. Copy the live value as it is.
- **`comment` or `tags` being cleared**, if someone left one in the dashboard.
- **A zone setting changing.** Harmless while nothing is proxied (above), so this one can be applied.

Forwarding rules import the same way. List them:

```bash
curl -s -H "Authorization: Bearer $TF_VAR_cloudflare_api_token" \
  "https://api.cloudflare.com/client/v4/zones/<zone_id>/email/routing/rules" \
  | jq -r '.result[] | [.id, .name, .enabled, (.matchers | tostring), (.actions | tostring)] | @tsv'
```

For each, add an entry to `email_routing_rules` keyed by its `name`, with the matcher's `value` as `address` and the forward action's value as `forward_to`, and put its `id` in `email_routing_rule_import_ids`. The plan must show no create for a rule. It may show `priority`, `enabled` or `source` settling to the API's value; if it proposes changing a rule's `name`, the key does not match the dashboard name exactly.

Once the plan shows only changes you mean, `apply`, then empty `record_import_ids` and `email_routing_rule_import_ids`. Import blocks are no-ops once the resource is in state, but the map is only needed once.

## After applying

1. `dig +short www.trakwyn.com`, `dig +short trakwyn.com` and `dig +short api.trakwyn.com` still answer as before.
2. `https://www.trakwyn.com` loads, `https://trakwyn.com` redirects to it, and `https://api.trakwyn.com/health` answers.
3. In `infra/vercel`, `terraform show` reports `misconfigured = false` for both domains.
4. A Brevo test send passes DKIM and DMARC (Brevo's **Senders, Domains & Dedicated IPs → Domains** shows `trakwyn.com` authenticated).
5. A mail to each rule's address arrives at its `forward_to` inbox.

## Changing a record

Edit `local.records` and apply. Don't edit a managed record in the dashboard: the next `plan` shows it as drift and `apply` puts it back.

When the Cloud Run domain mapping is recreated (`infra/gcp/README.md`, "Cut over"), check `terraform output domain_dns_records` there against the `api` entry here. It should still be `ghs.googlehosted.com`; if Google ever answers differently, change it here.
