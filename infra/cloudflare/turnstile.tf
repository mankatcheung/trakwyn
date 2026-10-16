# The Turnstile widget behind the sign-up, password-reset and repeated-failure
# sign-in captcha (JEF-401). It belongs to the account, not the zone, so the
# token needs Account · Turnstile · Edit (README.md).
#
# "managed" lets Cloudflare choose between a checkbox and an invisible check.
# `domains` lists the hostnames a token is valid for; the apex only redirects
# to www, so it is not a place the widget is shown. localhost is left out on
# purpose: dev and CI run the API's permissive verifier and show no widget.
resource "cloudflare_turnstile_widget" "web" {
  account_id = var.account_id
  name       = "trakwyn-auth"
  domains    = var.turnstile_domains
  mode       = "managed"
  region     = "world"
}
