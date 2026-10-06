# apps/api-rust — subsystem notes

Loaded when working under `apps/api-rust`. This is the Rust implementation of `apps/api` (axum + async-graphql + sqlx on tokio). It is a port, not a redesign: the behaviour, the wire format and the database are `apps/api`'s, and `apps/api/CLAUDE.md` still describes _why_ things are the way they are. Paths below are relative to `apps/api-rust/` unless stated.

## Commands

Run from `apps/api-rust` — the pinned toolchain (`rust-toolchain.toml`) is only picked up from inside this directory.

```bash
scripts/test.sh                    # whole suite, against a throwaway Postgres it starts and removes
scripts/test.sh notes::            # one module (any `cargo test` filter)
cargo test --lib                   # unit tests only, no database
cargo clippy --all-targets -- -D warnings
cargo fmt
cargo run                          # serve on PORT (3001), reading .env
cargo run -- migrate               # apply apps/api/drizzle/*.sql
```

`DATABASE_URL` must be `postgres://…`; there is no PGlite here. `TEST_DATABASE_URL` (a server the tests may create databases on) makes `scripts/test.sh` skip starting its own.

## The contract

- **GraphQL:** `schema.graphql` is the SDL printed from `apps/api`'s Pothos schema. `tests/integration/sdl_parity.rs` holds this schema to it field for field, and `tests/integration/pending_operations.txt` lists what is not ported yet. That list may only shrink: delete the line in the same change that implements the operation. Never edit `schema.graphql` by hand.
- **Database:** `apps/api` owns the schema. Migrations are `apps/api/drizzle/*.sql`; this crate applies the same files and records them in the same `__drizzle_migrations` table (`infrastructure/db/migrations.rs`). Never add a migration here.
- **Tokens and cookies** are interchangeable with `apps/api`'s: same JWT claims and secrets (HS256), same bcrypt hashes, same cookie names and attributes, same nanoid ids. Both implementations must be able to run against one database at once.

## Layers

```
src/domain/           Pure entities. No sqlx, no axum, no async-graphql, no serde derives for transport.
src/use_cases/        Business logic. ports/ holds the traits; errors.rs the DomainError; constants.rs policy.
src/infrastructure/   Implementations of the ports: db/repositories (sqlx), auth, cache, email, storage, …
src/http/             Router, cookies, CORS, error mapping, container.rs, di/ (use-case factories), graphql/, routes/.
```

The dependency rule is `apps/api`'s: `domain` imports nothing from the crate; `use_cases` imports `domain` only; `infrastructure` imports `use_cases` and `domain`; `http` may import anything. A use case never names sqlx, axum, async-graphql, reqwest or an env var.

## Porting conventions

One TypeScript file maps to one Rust file with the snake_case name (`CreateNoteUseCase.ts` → `use_cases/notes/create_note.rs`). The notes slice is the reference: read `use_cases/notes/`, `infrastructure/db/repositories/note.rs`, `http/graphql/notes.rs`, `http/di/notes.rs` and their tests before porting anything.

- **Port behaviour exactly**, including error messages, error codes, ordering, limits and the order of side effects. Messages reach users verbatim. Do not "improve" behaviour while porting; if the original looks wrong, port it and say so in your report.
- **Entities** (`domain/<name>.rs`): plain structs with `pub` fields, `#[derive(Debug, Clone, PartialEq)]` (add `Eq` when no float field). A closed string union becomes an enum with `ALL`, `as_str()` and `parse()` (see `domain/application.rs`). Timestamps are `chrono::DateTime<Utc>`.
- **Ports** (`use_cases/ports/<name>.rs`): `#[async_trait] pub trait X: Send + Sync`, methods returning `DomainResult<T>`. Input shapes are named structs next to the trait. `string | null` is `Option<String>`; a partial-update object is a struct of `Option`s, with `Option<Option<T>>` for a nullable column that can be set to null.
- **Use cases** (`use_cases/<domain>/<name>.rs`): a struct of `pub` `Arc<dyn Port>` fields and one `pub async fn execute(&self, input) -> DomainResult<Output>`. No constructor; the DI factory builds it with a struct literal.
- **Errors:** fail with a `DomainError` constructor (`not_found`, `forbidden`, `conflict`, `validation`, `unauthorized`, …). Never `panic!`, `unwrap()` or `expect()` outside tests. An infrastructure failure becomes `DomainError::internal(err)`; its message never reaches a client.
- **Time and ids:** `use_cases::clock::now()` (millisecond-truncated, because columns are `timestamptz(3)`) and the injected `GenerateId`. Never `Utc::now()` for a value that is stored, never SQL `now()`.
- **Repositories** (`infrastructure/db/repositories/<name>.rs`): `PgXRepository { db: Db }`. Each method takes `self.db.conn().await?` and drops it before returning, so it joins an ambient transaction (`Db::transaction`). Tables and columns keep Drizzle's quoted camelCase names: write `r#"SELECT * FROM "Note" WHERE "applicationId" = $1"#`. Use runtime `sqlx::query` with `.bind()`; the `query!` macros need a live database at compile time and are not used. Map rows with a `to_entity(&PgRow)` function. Postgres gotchas from `apps/api` apply: `ILIKE` for case-insensitive search, `count(*)` is `i64`, `sum`/`avg` over `bigint` is `numeric`.
- **A column Drizzle fills in application code** (`$defaultFn`, `$onUpdate`) has no SQL default. Check `apps/api/src/infrastructure/db/schema/*.ts` and bind the value yourself: `createdAt`/`updatedAt` from `now()`, and `updatedAt` again on every update.
- **GraphQL** (`http/graphql/<domain>.rs`): a `#[derive(SimpleObject)]` per output type with `#[graphql(name = "…")]` matching the contract, a `<Domain>Query` and `<Domain>Mutation`, both merged in `http/graphql/mod.rs`. Every output field is an `Option` (Pothos fields are nullable by default) and resolvers return `Result<Option<T>>`. Enum values keep the contract's spelling (`#[graphql(rename_items = "lowercase")]` or per-item `name`). Timestamps go out through `support::iso`. A guarded resolver starts with `require_user(ctx)?`; convert a use case's result with `.gql()?`.
- **DI:** singletons (repositories, services) are fields of `http::container::Container`. Use-case factories live in `http/di/<domain>.rs` as `impl Container { pub fn x_use_case(&self) -> XUseCase { … } }`.
- **Config:** env vars are read once, in `config`, never inside a use case or a service. Each infrastructure area has a module there (`config/cache.rs`, `config/email.rs`, …) holding a struct with `from_lookup(get: EnvLookup) -> Result<Self, ConfigError>`; the variable names are `apps/api`'s.
- **Constants:** policy goes in `use_cases/constants.rs` as a `pub mod <area> { … }` block appended at the end of the file; transport constants likewise in `http/constants.rs`. An infrastructure module keeps its own vendor endpoints, key prefixes and tuning values as private constants at its top. State each value once and derive the rest.
- **Logging and metrics:** a use case logs through the injected `Logger` port (`use_cases/ports/logger.rs`); infrastructure may use `tracing` directly. Never log a credential, a token, an email body, an IP or an error's raw text where it could quote user data.
- **Registry files** (`mod.rs` under `domain`, `use_cases`, `use_cases/ports`, `use_cases/test_support`, `infrastructure`, `infrastructure/db/repositories`, `http/di`, `http/routes`, and `tests/integration/main.rs`) hold only single-line `mod`/`pub mod`/`pub use` statements, one `pub use` line per module, so concurrent additions merge cleanly.

## Testing

Tests ship with the code they cover, at the tier `apps/api` tests it:

- **Use cases:** unit tests in the crate (`#[cfg(test)]`, e.g. `use_cases/notes/tests.rs`) using the in-memory fakes in `use_cases/test_support/<domain>.rs`. A fake implements the whole port honestly (it stores and filters), not a call recorder.
- **Repositories:** `tests/integration/` against real Postgres via `TestDb::create()` (a database per test, cloned from a migrated template). Seed with the helpers in `tests/integration/common.rs`.
- **Resolvers and routes:** `tests/integration/` through `TestApp`, which drives the fully wired router in-process.
- Port the cases the TypeScript suite has for the file you are porting (`apps/api/src/__tests__/…`), plus one per error branch.

`cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` must pass.
