# Forwarding rules for inbound mail to @trakwyn.com. Email Routing itself
# (enabling it, its MX/SPF/DKIM records), the catch-all and the verified
# destination addresses stay in the dashboard (README.md, "What it does not
# own").
#
# The rules come from terraform.tfvars, not this file, because each forwards
# to a personal inbox that has no business in the repo.
import {
  for_each = var.email_routing_rule_import_ids
  to       = cloudflare_email_routing_rule.this[each.key]
  id       = "${var.zone_id}/${each.value}"
}

resource "cloudflare_email_routing_rule" "this" {
  for_each = var.email_routing_rules

  zone_id = var.zone_id
  name    = each.key
  enabled = true

  matchers = [{
    type  = "literal"
    field = "to"
    value = each.value.address
  }]

  actions = [{
    type  = "forward"
    value = [each.value.forward_to]
  }]
}
