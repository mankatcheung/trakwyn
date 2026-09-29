# The value infra/gcp's upstash_redis_rest_url takes. It is copied there as a
# literal rather than read through terraform_remote_state, which would hand
# infra/gcp read access to this root's state and the credentials in it.
output "rest_url" {
  description = "The database's REST URL (UPSTASH_REDIS_REST_URL). Not secret."
  value       = "https://${upstash_redis_database.this.endpoint}"
}
