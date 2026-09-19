# syntax=docker/dockerfile:1
#
# Production image for apps/api, deployed to Cloud Run (see infra/gcp/).
# Build from the repo root — the pnpm workspace and lockfile live there:
#
#   docker build -f apps/api/Dockerfile -t trakwyn-api .
#   docker run --rm -p 8080:8080 --env-file apps/api/.env -e PORT=8080 trakwyn-api
#
# Migrations are not run here: CI's migrate-db job applies them before
# deploy-api ships a new image.

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build
WORKDIR /repo
# corepack honours the root package.json's `packageManager` pin. HUSKY=0
# skips the root `prepare` script's git hooks, which need a .git directory.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    HUSKY=0
RUN corepack enable

# Manifests first, so the dependency layer is only rebuilt when they change.
# Every workspace manifest is copied (not just the API's) because
# --frozen-lockfile checks the lockfile against the whole workspace.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/cli/package.json apps/cli/
COPY apps/extension/package.json apps/extension/
COPY apps/mobile/package.json apps/mobile/
COPY apps/web/package.json apps/web/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter @trakwyn/api...

COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN pnpm --filter @trakwyn/api build

# A self-contained copy of the API with production dependencies only.
# --legacy: the API has no workspace dependencies to inject, so the
# inject-workspace-packages mode `pnpm deploy` otherwise requires buys nothing.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter @trakwyn/api deploy --prod --legacy /out \
 && rm -rf /out/src /out/drizzle /out/scripts /out/Dockerfile* /out/*.config.* \
          /out/tsconfig*.json

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8080
# Plain node rather than `pnpm start`: no package manager in the runtime
# image, and the default `#src/*` import condition resolves to dist/.
# --import preloads OpenTelemetry before the app is imported, which is the
# only way its instrumentations can patch ESM modules (JEF-346).
CMD ["node", "--import", "./dist/instrumentation.js", "dist/index.js"]
