# syntax=docker/dockerfile:1
#
# Production image for apps/api-rust. Build from the repo root, since the image
# carries apps/api's Drizzle migrations (this crate applies the same files):
#
#   docker build -f apps/api-rust/Dockerfile -t trakwyn-api-rust .
#   docker run --rm -p 8080:8080 --env-file apps/api-rust/.env -e PORT=8080 trakwyn-api-rust
#
# Migrations are not run on start. Apply them first, from this image or any
# other:  docker run --rm -e DATABASE_URL=... trakwyn-api-rust migrate

# Keep in step with rust-toolchain.toml.
ARG RUST_VERSION=1.99.0

FROM rust:${RUST_VERSION}-slim-bookworm AS build
WORKDIR /repo/apps/api-rust

# Dependencies first, against a stub crate, so this layer only rebuilds when
# the manifest or lockfile change.
COPY apps/api-rust/Cargo.toml apps/api-rust/Cargo.lock apps/api-rust/rust-toolchain.toml ./
RUN mkdir src \
 && echo 'fn main() {}' > src/main.rs \
 && echo '' > src/lib.rs \
 && cargo build --release --locked \
 && rm -rf src target/release/deps/trakwyn_api* target/release/trakwyn-api* target/release/.fingerprint/trakwyn-api*

COPY apps/api-rust/src ./src
COPY apps/api-rust/assets ./assets
RUN cargo build --release --locked

FROM debian:bookworm-slim AS runtime
# The commit SHA this image was built from, reported as the service version.
ARG APP_RELEASE=dev
ENV NODE_ENV=production \
    PORT=8080 \
    APP_RELEASE=$APP_RELEASE \
    MIGRATIONS_DIR=/app/drizzle
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --no-create-home --uid 10001 trakwyn
WORKDIR /app
COPY --from=build /repo/apps/api-rust/target/release/trakwyn-api /usr/local/bin/trakwyn-api
COPY apps/api/drizzle ./drizzle
USER trakwyn
EXPOSE 8080
ENTRYPOINT ["trakwyn-api"]
CMD ["serve"]
