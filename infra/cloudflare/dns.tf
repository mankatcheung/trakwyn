locals {
  zone = "trakwyn.com"

  # Every record in the zone except the ones Email Routing owns (README.md,
  # "What it does not own"). Values, TTLs included, are what the Cloudflare
  # API returned on 2026-09-27 (JEF-371); adopting them must not change any.
  #
  # Nothing is proxied. Vercel and the Cloud Run domain mapping each issue
  # their own certificate and need to see requests arrive at their own
  # addresses, and a proxied api.* would also sit Cloudflare between the
  # browser and the auth cookies. ttl = 1 is Cloudflare's "Auto"; the email
  # records were entered with an hour.
  records = {
    # Web app (infra/vercel/domains.tf). The apex only redirects to www.
    # Both point at Vercel's project-specific target, from its domain
    # settings page. The apex CNAME is flattened, so public DNS answers it
    # with Vercel's A records instead.
    apex = { name = local.zone, type = "CNAME", content = "d2d4da7bff050db5.vercel-dns-017.com", ttl = 1 }
    www  = { name = "www.${local.zone}", type = "CNAME", content = "d2d4da7bff050db5.vercel-dns-017.com", ttl = 1 }

    # API: the Cloud Run domain mapping (infra/gcp/cloud_run.tf). Its
    # `domain_dns_records` output names this target; it is the same host for
    # every mapping, so it is stated here rather than read across roots.
    api = { name = "api.${local.zone}", type = "CNAME", content = "ghs.googlehosted.com", ttl = 1 }

    # Outbound email through Brevo (apps/api BrevoEmailService). The values
    # Brevo expects are infra/brevo's outputs; they are stated here, not read.
    brevo_dkim_1       = { name = "brevo1._domainkey.${local.zone}", type = "CNAME", content = "b1.trakwyn-com.dkim.brevo.com", ttl = 3600 }
    brevo_dkim_2       = { name = "brevo2._domainkey.${local.zone}", type = "CNAME", content = "b2.trakwyn-com.dkim.brevo.com", ttl = 3600 }
    dmarc              = { name = "_dmarc.${local.zone}", type = "TXT", content = "\"v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com\"", ttl = 3600 }
    brevo_verification = { name = local.zone, type = "TXT", content = "\"brevo-code:abffcf2a49db1305fe0c23f5fd8e93fb\"", ttl = 3600 }

    # Domain ownership for Google Search Console, which the Cloud Run domain
    # mapping requires (infra/gcp/README.md, "Bootstrap").
    google_verification = { name = local.zone, type = "TXT", content = "\"google-site-verification=TRDE-JVfGbWbO5dV_KkqOd37nyBbmsRQxFc64B4zNqE\"", ttl = 3600 }
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
  ttl     = each.value.ttl
  proxied = false
}
