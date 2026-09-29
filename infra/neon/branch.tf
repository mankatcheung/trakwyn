import {
  to = neon_branch.production
  id = "${var.project_id}/${var.branch_id}"
}

# The project's default branch, which holds production's data. Destroying
# it deletes the database, so Terraform refuses to plan that at all.
#
# `protected` is omitted rather than "no" when protect_branch is false.
# Unprotected is Neon's default, and the provider only reads the flag back
# once it has been set, so "no" would show as a change on every import.
resource "neon_branch" "production" {
  project_id = var.project_id
  name       = var.branch_name
  protected  = var.protect_branch ? "yes" : null

  lifecycle {
    prevent_destroy = true
  }
}
