# The identity the Clipper's release job (JEF-419) uploads to the Chrome Web
# Store as, through API v2. It holds no role in this project: what it may do is
# granted in the Web Store developer dashboard, where the listing's owner adds
# this email as a user of the account (Terraform cannot do that step).
#
# Unlike every other account here it needs a JSON key. The Web Store API takes
# a signed service-account JWT, which the upload tool builds from the private
# key; it cannot use Workload Identity Federation. The key is deliberately not
# a Terraform resource, so it never enters state: create it with gcloud and
# put it straight into the GitHub secret (README, "Rotate the Web Store key").
resource "google_service_account" "chrome_web_store_publisher" {
  account_id   = "chrome-web-store-publisher"
  display_name = "Clipper release upload to the Chrome Web Store"

  depends_on = [google_project_service.enabled]
}
