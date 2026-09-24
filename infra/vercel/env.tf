locals {
  # Every value here is inlined into the client bundle by Vite (VITE_ prefix),
  # so none is secret and none is marked sensitive. A sensitive Vercel var
  # cannot be read back, which would leave its drift invisible to plan.
  #
  # VITE_APP_RELEASE is absent on purpose. apps/web/vite.config.ts derives
  # it from VERCEL_GIT_COMMIT_SHA when unset, and a value set here would take
  # precedence and pin every release to one string. Release tagging is
  # JEF-362's to decide.
  env = {
    VITE_API_URL = {
      value   = var.api_url
      comment = "GraphQL endpoint on the API's custom domain (infra/gcp)."
    }
    VITE_POSTHOG_HOST = {
      value   = var.posthog_host
      comment = "PostHog EU ingestion host."
    }
    VITE_POSTHOG_KEY = {
      value   = data.terraform_remote_state.posthog.outputs.project_api_key
      comment = "Public PostHog project key, from infra/posthog's state."
    }
  }
}

import {
  for_each = var.env_var_import_ids
  to       = vercel_project_environment_variable.this[each.key]
  id       = "${var.team_id}/${var.project_id}/${each.value}"
}

# Production only: CI never creates preview deployments, because the
# project is not connected to git and deploy-web always passes --prod.
resource "vercel_project_environment_variable" "this" {
  for_each = local.env

  project_id = vercel_project.web.id
  key        = each.key
  value      = each.value.value
  comment    = each.value.comment
  target     = ["production"]
  sensitive  = false
}

# The dataset the web app's Vercel function sends its server-side errors to
# (JEF-359, apps/web/src/server/observability/serverLogConfig.ts). Read from
# process.env at request time, never through Vite, so unlike local.env it
# does not reach the client bundle. Not secret, hence managed here.
#
# Its partner AXIOM_WEB_TOKEN is deliberately not a resource: it is an
# ingest-only secret, set by hand as a sensitive var (README.md, "Server-side
# error logging"), so it never passes through a tfvars file, a plan or state.
resource "vercel_project_environment_variable" "axiom_web_dataset" {
  project_id = vercel_project.web.id
  key        = "AXIOM_WEB_DATASET"
  value      = var.axiom_web_dataset
  comment    = "Axiom dataset for the web function's server-side errors; must match infra/axiom's web_dataset."
  target     = ["production"]
  sensitive  = false
}
