locals {
  zone = "trakwyn.com"

  # Every record in the zone except the ones Email Routing owns (README.md,
  # "What it does not own"). Values are what public DNS served when this root
  # was written (JEF-371); adopting them must not change any of them.
  #
  # Nothing is proxied. Vercel and the Cloud Run domain mapping each issue
  # their own certificate and need to see requests arrive at their own
  # addresses, and a proxied api.* would also sit Cloudflare between the
  # browser and the auth cookies. ttl = 1 is Cloudflare's "Auto".
  records = {
    # Web app (infra/vercel/domains.tf). The apex only redirects to www.
    # Vercel's project-specific targets, from its domain settings page.
    apex_a_1 = { name = local.zone, type = "A", content = "216.198.79.65" }
    apex_a_2 = { name = local.zone, type = "A", content = "64.29.17.65" }
    www      = { name = "www.${local.zone}", type = "CNAME", content = "d2d4da7bff050db5.vercel-dns-017.com" }

    # API: the Cloud Run domain mapping (infra/gcp/cloud_run.tf). Its
    # `domain_dns_records` output names this target; it is the same host for
    # every mapping, so it is stated here rather than read across roots.
    api = { name = "api.${local.zone}", type = "CNAME", content = "ghs.googlehosted.com" }

    # Outbound email through Brevo (apps/api BrevoEmailService).
    brevo_dkim_1       = { name = "brevo1._domainkey.${local.zone}", type = "CNAME", content = "b1.trakwyn-com.dkim.brevo.com" }
    brevo_dkim_2       = { name = "brevo2._domainkey.${local.zone}", type = "CNAME", content = "b2.trakwyn-com.dkim.brevo.com" }
    dmarc              = { name = "_dmarc.${local.zone}", type = "TXT", content = "\"v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com\"" }
    brevo_verification = { name = local.zone, type = "TXT", content = "\"brevo-code:abffcf2a49db1305fe0c23f5fd8e93fb\"" }

    # Domain ownership for Google Search Console, which the Cloud Run domain
    # mapping requires (infra/gcp/README.md, "Bootstrap").
    google_verification = { name = local.zone, type = "TXT", content = "\"google-site-verification=TRDE-JVfGbWbO5dV_KkqOd37nyBbmsRQxFc64B4zNqE\"" }
  }
}

import {
  for_each = var.record_import_ids
  to       = cloudflare_dns_record.this[each.key]
  id       = "${var.zone_id}/${each.value}"
}

resource "cloudflare_dns_record" "this" {
  for_each = local.records

  zone_id = var.zone_id
  name    = each.value.name
  type    = each.value.type
  content = each.value.content
  ttl     = 1
  proxied = false
}
