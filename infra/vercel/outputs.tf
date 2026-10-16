# Read by infra/gcp/load-secrets.sh to fetch each Blob store's token from the
# Vercel API. None is secret.
output "blob_store_id" {
  description = "ID of the public Blob store, which holds avatars (store_...)."
  value       = vercel_blob_store.uploads.id
}

output "documents_blob_store_id" {
  description = "ID of the private Blob store, which holds documents (store_...)."
  value       = vercel_blob_store.documents.id
}

output "team_id" {
  description = "Vercel team that owns the Blob stores and the web project."
  value       = var.team_id
}
