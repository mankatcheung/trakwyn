import {
  to = neon_database.app
  id = "${var.project_id}/${var.branch_id}/${var.database_name}"
}

# The database the API and its migrations use. Declared so its owner is
# recorded and a delete is refused; its schema belongs to apps/api's
# migrations, not to Terraform.
resource "neon_database" "app" {
  project_id = var.project_id
  branch_id  = neon_branch.production.id
  name       = var.database_name
  owner_name = var.database_owner

  lifecycle {
    prevent_destroy = true
  }
}
