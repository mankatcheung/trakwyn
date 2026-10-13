import {
  to = vercel_blob_store.uploads
  id = "${var.team_id}/${var.blob_store_id}"
}

# The two stores the API uploads to (STORAGE_PROVIDER=vercel-blob, infra/gcp's
# cloud_run.tf). Both are read by Cloud Run, not by the web project, so neither
# has a vercel_blob_project_connection, and their files are runtime data owned
# by @vercel/blob, so there is no vercel_blob_object either.
#
# A store's access is fixed when it is created, so keeping avatars public and
# documents private (JEF-51) takes two: `uploads` below, which was always
# public and is imported, and `documents`, which is new and private. Which
# files go where is decided by storageAccessFor() in apps/api.
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
  # Avatars, which other users see as <img src>, so their URLs must be public.
  # Documents were here too until the copy to `documents` finishes (JEF-51).
  access = "public"
  region = var.blob_store_region

  lifecycle {
    prevent_destroy = true
  }
}

# Documents and exported PDFs (JEF-51). Private: a blob here has no URL anyone
# can open, so it is only readable with this store's token, by the API, which
# serves it behind a signed link. Created by this root, not imported, and held
# to the same rule as `uploads`: name, access and region force a replacement,
# and replacing it deletes every document.
resource "vercel_blob_store" "documents" {
  name   = var.documents_blob_store_name
  access = "private"
  # The same region as `uploads`, so the copy between them stays in one region.
  region = var.blob_store_region

  lifecycle {
    prevent_destroy = true
  }
}
