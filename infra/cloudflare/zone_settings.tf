locals {
  # These only act on proxied traffic, and no record in dns.tf is proxied, so
  # today they change nothing a visitor sees. They are pinned so that turning
  # the proxy on for a record later cannot quietly serve it over flexible
  # SSL (plain HTTP to the origin) or old TLS.
  zone_settings = {
    ssl              = "strict" # Full (strict): verify the origin's certificate
    always_use_https = "on"
    min_tls_version  = "1.2"
  }
}

# Zone settings always exist, so they are imported unconditionally. The
# import is a no-op once the setting is in state.
import {
  for_each = local.zone_settings
  to       = cloudflare_zone_setting.this[each.key]
  id       = "${var.zone_id}/${each.key}"
}

resource "cloudflare_zone_setting" "this" {
  for_each = local.zone_settings

  zone_id    = var.zone_id
  setting_id = each.key
  value      = each.value
}
