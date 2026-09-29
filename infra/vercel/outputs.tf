# Read by infra/gcp/load-secrets.sh to fetch the Blob store's token from the
# Vercel API. Neither is secret.
output "blob_store_id" {
  description = "ID of the Blob store the API uploads to (store_...)."
  value       = vercel_blob_store.uploads.id
}

output "team_id" {
  description = "Vercel team that owns the Blob store and the web project."
  value       = var.team_id
}
