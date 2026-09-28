locals {
  # The API's default From (EMAIL.DEFAULT_FROM_EMAIL and DEFAULT_FROM_NAME in
  # apps/api/src/infrastructure/config/constants.ts). Keep the two in step.
  sender = {
    email = "noreply@${local.domain}"
    name  = "Trakwyn"
  }
}

# Senders import by their numeric ID, which only Brevo's /v3/senders lists, so this
# runs only while sender_import_id is set (README.md).
import {
  for_each = var.sender_import_id == null ? toset([]) : toset([var.sender_import_id])
  to       = brevo_sender.noreply
  id       = each.value
}

resource "brevo_sender" "noreply" {
  email = local.sender.email
  name  = local.sender.name

  # Changing `email` forces replacement, and the provider's delete removes
  # the sender the API sends every mail from.
  lifecycle {
    prevent_destroy = true
  }
}
