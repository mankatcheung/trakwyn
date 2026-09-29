import {
  to = neon_endpoint.production
  id = "${var.project_id}/${var.endpoint_id}"
}

# The read-write compute on the production branch. Its host is part of both
# connection strings (Secret Manager's database-url and CI's
# PRODUCTION_DATABASE_URL), so a replacement would break both until they were
# re-set by hand.
#
# There is no pooler setting: Neon pools every endpoint, and host_pooling is
# the `-pooler` host the API's database-url must use (infra/gcp/README.md).
resource "neon_endpoint" "production" {
  project_id = var.project_id
  branch_id  = neon_branch.production.id
  type       = "read_write"

  # Free plan: a fixed 0.25 CU, and a suspend timeout of 0, which means
  # Neon's default: scale to zero after five minutes idle, not configurable
  # on Free. infra/axiom's pool-error monitor is tested by waiting out
  # exactly those five minutes (infra/axiom/README.md). On a paid plan,
  # raise the max for autoscaling and set an explicit timeout here.
  autoscaling_limit_min_cu = 0.25
  autoscaling_limit_max_cu = 0.25
  suspend_timeout_seconds  = 0

  lifecycle {
    prevent_destroy = true

    postcondition {
      condition     = self.region_id == var.region
      error_message = "The production compute is in ${self.region_id}, not ${var.region}. A region cannot be changed in place; check project_id and endpoint_id."
    }
  }
}
