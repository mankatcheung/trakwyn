# Trakwyn API (Rust)

A Rust implementation of [`apps/api`](../api): axum, async-graphql and sqlx on tokio. It serves the same GraphQL schema over the same Postgres database, with the same cookies and tokens, so either implementation can sit behind the clients.

It is a Cargo package, not a pnpm workspace member: Turbo does not build or test it, and `apps/api`'s Docker image (which installs against every workspace manifest) is unaffected by it.

## Running it

You need Rust (rustup installs the toolchain pinned in `rust-toolchain.toml` on first use) and a Postgres server. There is no PGlite here, so `DATABASE_URL` must be a `postgres://` URL.

```bash
cd apps/api-rust
cp ../api/.env .env                 # same variable names; then point DATABASE_URL at Postgres
cargo run -- migrate                # applies ../api/drizzle/*.sql
cargo run                           # serves on PORT (default 3001); GraphiQL at /graphiql outside production
```

To put the web app in front of it, stop `apps/api` (both default to port 3001) and start this instead.

## Testing

```bash
scripts/test.sh                     # everything, against a throwaway Postgres it starts and removes
scripts/test.sh notes::             # any `cargo test` filter
cargo test --lib                    # unit tests only; no database
cargo clippy --all-targets -- -D warnings
cargo fmt --check
```

`scripts/test.sh` needs Postgres binaries (`initdb`, `pg_ctl`) on `PATH` or in a standard location. To use a server you already have, set `TEST_DATABASE_URL` to one the tests may create databases on; each test clones its own database from a migrated template.

## What keeps it in step with `apps/api`

- **The GraphQL contract.** `schema.graphql` is the SDL printed from `apps/api`'s Pothos schema. `tests/integration/sdl_parity.rs` compares this implementation's schema to it field for field, and `tests/integration/pending_operations.txt` lists the operations not ported yet. That list may only shrink.
- **The database.** `apps/api` owns the schema. This crate applies the same migration files and records them in the same tracking table, so a database migrated by one is recognised as migrated by the other.
- **Sessions.** JWTs, password hashes, ids and cookies are interchangeable between the two.

### Regenerating the contract

After changing `apps/api`'s schema, reprint the SDL. From `apps/api`, with dependencies installed:

```bash
cat > src/__dump-sdl.ts <<'EOF'
import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { lexicographicSortSchema, printSchema } from 'graphql';

const { schema } = await import('#src/http/schema/index.js');
writeFileSync(process.argv[2]!, printSchema(lexicographicSortSchema(schema)) + '\n');
EOF
pnpm exec tsx -C development src/__dump-sdl.ts ../api-rust/schema.graphql
rm src/__dump-sdl.ts
```

Then run the tests here: the parity test names every operation and type that no longer matches.

## Layout

```
src/domain/           entities
src/use_cases/        business logic; ports/ holds the traits infrastructure implements
src/infrastructure/   Postgres repositories, auth, cache, email, storage, LLM providers, …
src/http/             router, cookies, CORS, error mapping, DI container, GraphQL schema, routes
tests/integration/    repository, resolver and route tests against real Postgres
```

Conventions for working in this package are in [`CLAUDE.md`](./CLAUDE.md).
