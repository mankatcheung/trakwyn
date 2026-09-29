import {
  to = vercel_blob_store.uploads
  id = "${var.team_id}/${var.blob_store_id}"
}

# The store the API uploads to (STORAGE_PROVIDER=vercel-blob, infra/gcp's
# cloud_run.tf). It is read by Cloud Run, not by the web project, so there is
# no vercel_blob_project_connection, and its files are runtime data owned by
# @vercel/blob, so no vercel_blob_object either.
#
# name, access and region all force a replacement in this provider, and
# access and region have defaults, so each must be stated and must match the
# live store exactly: a replacement would delete every upload. prevent_destroy
# turns such a plan into an error instead.
#
# The token is deliberately not read here. vercel_blob_store_secrets would
# write it to this root's state; infra/gcp/load-secrets.sh fetches it from
# the Vercel API instead and pipes it straight to Secret Manager (JEF-381).
resource "vercel_blob_store" "uploads" {
  name = var.blob_store_name
  # VercelBlobStorageProvider serves blob URLs directly, so they must be public.
  access = "public"
  region = var.blob_store_region

  lifecycle {
    prevent_destroy = true
  }
}
