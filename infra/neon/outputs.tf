# Hosts only. No output carries a password or a full connection string, and
# nothing in this root can: none of its resources reads one (README.md).

output "host" {
  description = "Direct host, for migrations (CI's PRODUCTION_DATABASE_URL)."
  value       = neon_endpoint.production.host
}

output "host_pooling" {
  description = "Pooled host, for the API (Secret Manager's database-url)."
  value       = neon_endpoint.production.host_pooling
}

output "region" {
  description = "The compute's region."
  value       = neon_endpoint.production.region_id
}
