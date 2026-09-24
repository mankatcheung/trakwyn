# The project API key (phc_...) is public by design: it ships in the web
# bundle and the mobile binary, and can only send events, not read them.
# The provider marks it sensitive anyway, so it is unwrapped here to keep it
# readable in `terraform output` and in infra/vercel's plan. Never pass
# anything through nonsensitive() that is actually secret.
output "project_api_key" {
  description = "Public project key the clients send events with. infra/vercel sets it as VITE_POSTHOG_KEY."
  value       = nonsensitive(posthog_project.web.api_token)
}

output "project_id" {
  description = "Numeric PostHog project ID."
  value       = posthog_project.web.id
}
