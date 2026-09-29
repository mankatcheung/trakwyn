# infra/brevo: the Brevo sender domain

The `trakwyn.com` sender domain in Brevo, as Terraform (JEF-380). Brevo sends every mail `apps/api` sends (`BrevoEmailService`). Before this, the domain was set up by hand in the dashboard, and nothing tied the Brevo records in `infra/cloudflare/dns.tf` to what Brevo expects.

## What it owns

| File         | What                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `domain.tf`  | The `trakwyn.com` sender domain, imported unconditionally. A `check` warns on `plan` when Brevo no longer reports it verified. |
| `outputs.tf` | The DKIM CNAME targets and the `brevo-code` verification value Brevo expects, and whether the domain is verified.              |

Things worth knowing:

- **The provider is a community one**, [`bbieniek/brevo`](https://registry.terraform.io/providers/bbieniek/brevo/latest): single maintainer, v0.1.x. It is pinned to an exact version whose source was read before it was given a key; it talks only to `api.brevo.com`. Read the diff again before bumping it. If it is ever abandoned, delete this root with `terraform state rm brevo_domain.this` (not `destroy`) and keep this README as the record of the dashboard config.
- **The domain has `prevent_destroy`.** Changing its `name` forces replacement, and the provider's delete really deletes: without the domain every send fails DKIM. To change it on purpose, remove the guard in the same change and say why.
- **DNS is not here.** Brevo only checks the records; they are literals in `infra/cloudflare/dns.tf` (`brevo_dkim_1`, `brevo_dkim_2`, `brevo_verification`, `dmarc`), per that root's rule that values are not read across roots. After an apply, compare `terraform output` with them.
- **A domain deleted in the dashboard** makes `plan` fail with a 404 rather than recreate it; re-add and authenticate it in the dashboard first.
- **The domain's `id` is `0` in state.** The provider fills it from Brevo's domain list, which doesn't return one. Every call goes by `name`, so nothing depends on it.

## What it does not own

- **Senders.** The API sends as `noreply@trakwyn.com` (`EMAIL.DEFAULT_FROM_*` in `apps/api/src/infrastructure/config/constants.ts`). Brevo accepts any address on an authenticated domain, so that address needs neither a sender entry nor a mailbox. The account's own sender, the address the Brevo account was opened with, is left alone.
- **API keys.** Brevo has no API for them. The API's runtime key is the `brevo-api-key` secret in Secret Manager (`infra/gcp`, `load-secrets.sh`).
- **Email templates.** The API builds its HTML in `apps/api/src/infrastructure/email/templates/`, so there are none in Brevo.
- **Webhooks.** The API has no endpoint for Brevo events yet. Add `brevo_webhook` here when bounce and complaint handling exists.
- Contacts, lists, campaigns, dedicated IPs, and account, plan and security settings.

## Why a separate root

For the same reason as `infra/axiom`, `infra/cloudflare`, `infra/posthog` and `infra/vercel`: the Brevo key is a provider argument, Terraform never writes provider arguments to state, and a separate root keeps it out of every other root's `apply`. State lives in the same GCS bucket under prefix `trakwyn/brevo`.

## Applying

You need Terraform ≥ 1.9, access to the `<project-id>-tfstate` bucket (see `infra/gcp/README.md`), and a Brevo API key for Terraform.

Brevo keys cannot be scoped: any key has full access to the account. So use one that is **not** the API's runtime key, and can be deleted or rotated without touching production. Create it under **your profile menu → SMTP & API → API Keys → Generate a new API key**, named `terraform`. If **Security → Authorised IPs** is on for the account, add the address you run Terraform from, or every call answers 401.

```bash
cd infra/brevo
cp .envrc.example .envrc && chmod 600 .envrc      # set the key; gitignored
source .envrc                                     # or let direnv load it
terraform init -backend-config="bucket=job-finder-503217-tfstate"
terraform plan
terraform apply
```

The key goes in `TF_VAR_brevo_api_key`, which `versions.tf` passes to the provider explicitly. Don't rely on the provider's own fallback, `BREVO_API_KEY`: that is the API's runtime variable name, and a shell that has `apps/api/.env` loaded would hand it the production key.

There is nothing to put in `terraform.tfvars`.

CI only runs `fmt` and `validate` on this root. `plan` and `apply` are run by hand.

### Adopting the live account

The domain imports by name on its own. The first `plan` must show **`1 to import, 0 to add, 0 to change, 0 to destroy`**. A replacement means `local.domain` does not match the live account: stop and find out why, since `prevent_destroy` will refuse it anyway.

## After applying

1. `terraform output` matches `infra/cloudflare/dns.tf`: `dkim_record_1` and `dkim_record_2` are the `brevo_dkim_1` and `brevo_dkim_2` targets, `brevo_code` is the `brevo_verification` content (without its quotes), and `verified` is `true`. If one differs, Brevo has rotated it: change the record in `infra/cloudflare` and apply that root.
2. `terraform plan` reports no changes.
3. A test send from production (e.g. a password reset to an inbox you own) arrives, and its headers show `dkim=pass` for `trakwyn.com` and `dmarc=pass`.
4. Brevo's **Senders, Domains & Dedicated IPs → Domains** still shows `trakwyn.com` authenticated.
