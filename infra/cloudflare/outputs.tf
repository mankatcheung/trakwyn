output "turnstile_site_key" {
  description = "Public Turnstile site key. Goes into infra/vercel's turnstile_site_key."
  value       = cloudflare_turnstile_widget.web.sitekey
}

output "turnstile_secret_key" {
  description = "Turnstile secret key. Not secret from Terraform's point of view (it is in this root's state), but copy it into Secret Manager as turnstile-secret-key by hand: `terraform output -raw turnstile_secret_key | gcloud secrets versions add turnstile-secret-key --data-file=-`."
  value       = cloudflare_turnstile_widget.web.secret
  sensitive   = true
}
