import {
  to = neon_branch.production
  id = "${var.project_id}/${var.branch_id}"
}

# The project's default branch, which holds production's data. Destroying
# it deletes the database, so Terraform refuses to plan that at all.
resource "neon_branch" "production" {
  project_id = var.project_id
  name       = var.branch_name
  protected  = var.protect_branch ? "yes" : "no"

  lifecycle {
    prevent_destroy = true
  }
}
