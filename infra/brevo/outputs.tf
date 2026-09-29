# What Brevo expects in DNS. Each should match the brevo_* record of the same
# purpose in infra/cloudflare/dns.tf, which states them as literals.
output "dkim_record_1" {
  description = "Target of the brevo1._domainkey CNAME."
  value       = brevo_domain.this.dkim_record_1
}

output "dkim_record_2" {
  description = "Target of the brevo2._domainkey CNAME."
  value       = brevo_domain.this.dkim_record_2
}

output "brevo_code" {
  description = "Content of the apex brevo-code verification TXT."
  value       = brevo_domain.this.brevo_code
}

output "verified" {
  description = "Whether Brevo considers the domain verified."
  value       = brevo_domain.this.verified
}

output "sender_id" {
  description = "Brevo's numeric ID of the noreply sender."
  value       = brevo_sender.noreply.id
}
