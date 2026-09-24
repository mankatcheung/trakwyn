import {
  to = vercel_project.web
  id = "${var.team_id}/${var.project_id}"
}

# Configuration only. Releases stay with CI's deploy-web job, which runs
# `vercel build` and `vercel deploy --prebuilt --prod` against this project
# (.github/actions/vercel-deploy-production), the same split infra/gcp makes
# with deploy-api.
#
# There is deliberately no git_repository block. Connecting the repo would
# make Vercel deploy every push on its own, alongside CI, and before CI's
# tests have passed. Declaring its absence means a plan reports it if
# somebody connects it in the dashboard.
#
# build_command, install_command, output_directory and framework are
# optional without a computed default in this provider, so leaving one out
# means "unset". The build does not need them: nitro's `vercel` preset
# (apps/web/vite.config.ts) writes the Build Output API directory itself.
# If the first plan after import proposes clearing one, copy the live value
# here instead (README.md, "Adopting the live project").
resource "vercel_project" "web" {
  name           = var.project_name
  root_directory = "apps/web"
}
