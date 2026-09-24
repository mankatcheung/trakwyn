locals {
  # www serves the app; the apex, when there is one, only redirects to it.
  # Nothing reads the redirect status, so a permanent 308 keeps the method.
  domains = merge(
    { www = { domain = var.production_domain, redirect = null, redirect_status_code = null } },
    var.apex_domain == null ? {} : {
      apex = { domain = var.apex_domain, redirect = var.production_domain, redirect_status_code = 308 }
    },
  )
}

import {
  for_each = local.domains
  to       = vercel_project_domain.this[each.key]
  id       = "${var.team_id}/${var.project_id}/${each.value.domain}"
}

# DNS for these stays at the registrar (out of scope, JEF-363). A domain
# that Vercel reports as misconfigured shows up in `terraform show` as
# misconfigured = true.
resource "vercel_project_domain" "this" {
  for_each = local.domains

  project_id           = vercel_project.web.id
  domain               = each.value.domain
  redirect             = each.value.redirect
  redirect_status_code = each.value.redirect_status_code
}
