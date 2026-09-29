locals {
  domain = "trakwyn.com"
}

# The domain already exists and is authenticated, so it is imported
# unconditionally. The import is a no-op once it is in state.
import {
  to = brevo_domain.this
  id = local.domain
}

# Brevo only reads the domain's DNS; the records themselves are literals in
# infra/cloudflare/dns.tf. Compare them with this root's outputs (README.md).
resource "brevo_domain" "this" {
  name = local.domain

  # Changing `name` forces replacement, and the provider's delete removes the
  # domain from Brevo, which stops all mail until it is re-authenticated.
  lifecycle {
    prevent_destroy = true
  }
}

check "domain_authenticated" {
  assert {
    condition     = brevo_domain.this.verified
    error_message = "Brevo reports ${local.domain} as not verified. Check the brevo_* records in infra/cloudflare/dns.tf against `terraform output`."
  }
}
