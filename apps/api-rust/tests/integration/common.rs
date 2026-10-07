//! Test doubles for the outside world: a database per test and the app
//! driven in-process.
//!
//! Each test gets its own database, cloned from a template that has the real
//! migrations applied, so tests run in parallel without seeing each other's
//! rows. The databases are not dropped: the server is expected to be
//! disposable (`scripts/test.sh` locally, a service container in CI).

use std::str::FromStr;
use std::sync::Arc;

use axum::body::Body;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, COOKIE};
use axum::http::{HeaderMap, Request, StatusCode};
use axum::Router;
use http_body_util::BodyExt;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use sqlx::postgres::{PgConnectOptions, PgPoolOptions};
use sqlx::{ConnectOptions, Connection, PgConnection};
use tower::ServiceExt;

use trakwyn_api::config::{Config, NodeEnv};
use trakwyn_api::http::app::build_router;
use trakwyn_api::http::container::Container;
use trakwyn_api::infrastructure::db::migrations::{apply_migrations, default_migrations_dir};
use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;

const ADMIN_URL_VAR: &str = "TEST_DATABASE_URL";

/// Serializes template creation across test threads and test processes.
const TEMPLATE_LOCK_KEY: i64 = 342_002;

pub const JWT_SECRET: &str = "test-access-secret";
pub const JWT_REFRESH_SECRET: &str = "test-refresh-secret";

fn admin_options() -> PgConnectOptions {
    let url = std::env::var(ADMIN_URL_VAR).unwrap_or_else(|_| {
        panic!(
            "{ADMIN_URL_VAR} is not set. These tests need a Postgres server they may create \
             databases on; run `scripts/test.sh`, or point {ADMIN_URL_VAR} at one \
             (e.g. postgres://localhost:5432/postgres)."
        )
    });
    PgConnectOptions::from_str(&url)
        .unwrap_or_else(|err| panic!("{ADMIN_URL_VAR} is invalid: {err}"))
}

/// Names the template after the migrations it holds, so a changed migration
/// gets a fresh template instead of a stale one.
fn template_name() -> String {
    let dir = default_migrations_dir();
    let mut paths: Vec<_> = std::fs::read_dir(&dir)
        .unwrap_or_else(|err| panic!("cannot read {}: {err}", dir.display()))
        .filter_map(|entry| entry.ok().map(|entry| entry.path()))
        .filter(|path| path.extension().is_some_and(|extension| extension == "sql"))
        .collect();
    paths.sort();

    let mut hasher = Sha256::new();
    for path in paths {
        hasher.update(std::fs::read(&path).unwrap());
    }
    format!("trakwyn_template_{}", &hex::encode(hasher.finalize())[..12])
}

async fn ensure_template(admin: &mut PgConnection, template: &str) {
    let exists: bool =
        sqlx::query_scalar("SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)")
            .bind(template)
            .fetch_one(&mut *admin)
            .await
            .unwrap();
    if exists {
        return;
    }

    sqlx::raw_sql(&format!(r#"CREATE DATABASE "{template}""#)).execute(&mut *admin).await.unwrap();
    let mut conn = admin_options().database(template).connect().await.unwrap();
    apply_migrations(&mut conn, &default_migrations_dir()).await.unwrap();
    // A template with a session still attached cannot be cloned.
    conn.close().await.unwrap();
}

pub struct TestDb {
    pub db: Db,
}

impl TestDb {
    pub async fn create() -> Self {
        let template = template_name();
        let name = format!("trakwyn_test_{}", nanoid::nanoid!(16, &ALPHANUMERIC_LOWER));

        let mut admin = admin_options().connect().await.unwrap_or_else(|err| {
            panic!("cannot connect to the Postgres server in {ADMIN_URL_VAR}: {err}")
        });
        sqlx::query("SELECT pg_advisory_lock($1)")
            .bind(TEMPLATE_LOCK_KEY)
            .execute(&mut admin)
            .await
            .unwrap();
        ensure_template(&mut admin, &template).await;
        sqlx::raw_sql(&format!(r#"CREATE DATABASE "{name}" TEMPLATE "{template}""#))
            .execute(&mut admin)
            .await
            .unwrap();
        // Closing the session releases the advisory lock.
        admin.close().await.unwrap();

        let pool = PgPoolOptions::new()
            .max_connections(5)
            .connect_with(admin_options().database(&name))
            .await
            .unwrap();
        Self { db: Db::from_pool(pool) }
    }
}

const ALPHANUMERIC_LOWER: [char; 36] = [
    '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i',
    'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
];

pub fn test_config() -> Config {
    let base = Config::from_lookup(|name| match name {
        // The pool is injected, so this URL is never connected to.
        "DATABASE_URL" => Some("postgres://unused-the-pool-is-injected/test".to_string()),
        "JWT_SECRET" => Some(JWT_SECRET.to_string()),
        "JWT_REFRESH_SECRET" => Some(JWT_REFRESH_SECRET.to_string()),
        "EMAIL_PROVIDER" => Some("console".to_string()),
        _ => None,
    })
    .unwrap();
    Config { port: 0, node_env: NodeEnv::Test, ..base }
}

/// What came back from one request to the app.
pub struct Response {
    pub status: StatusCode,
    pub headers: HeaderMap,
    pub body: Value,
}

impl Response {
    /// `data.<field>`, failing the test if the response carries errors.
    pub fn data(&self, field: &str) -> &Value {
        assert!(self.body.get("errors").is_none(), "unexpected errors: {}", self.body);
        &self.body["data"][field]
    }

    /// The first error's `extensions.code`.
    pub fn error_code(&self) -> &str {
        self.body["errors"][0]["extensions"]["code"]
            .as_str()
            .unwrap_or_else(|| panic!("expected an error with a code, got: {}", self.body))
    }

    pub fn error_message(&self) -> &str {
        self.body["errors"][0]["message"].as_str().unwrap_or_default()
    }
}

/// How a request identifies itself.
pub enum Auth<'a> {
    None,
    Bearer(&'a str),
    Cookie(&'a str),
}

/// The fully wired app over a fresh database.
pub struct TestApp {
    pub router: Router,
    pub container: Arc<Container>,
    pub db: Db,
}

impl TestApp {
    pub async fn start() -> Self {
        Self::start_with(test_config()).await
    }

    pub async fn start_with(config: Config) -> Self {
        let TestDb { db } = TestDb::create().await;
        let container = Arc::new(Container::new(config, db.clone()).unwrap());
        Self { router: build_router(container.clone()), container, db }
    }

    pub async fn send(&self, request: Request<Body>) -> Response {
        let response = self.router.clone().oneshot(request).await.unwrap();
        let (parts, body) = response.into_parts();
        let bytes = body.collect().await.unwrap().to_bytes();
        let body = serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()));
        Response { status: parts.status, headers: parts.headers, body }
    }

    pub async fn graphql(&self, query: &str, variables: Value, auth: Auth<'_>) -> Response {
        let builder = Request::post("/graphql").header(CONTENT_TYPE, "application/json");
        let builder = match auth {
            Auth::None => builder,
            Auth::Bearer(token) => builder.header(AUTHORIZATION, format!("Bearer {token}")),
            Auth::Cookie(token) => builder.header(COOKIE, format!("trakwyn_access_token={token}")),
        };
        let body = json!({ "query": query, "variables": variables }).to_string();
        self.send(builder.body(Body::from(body)).unwrap()).await
    }

    /// An access token for `user_id`, signed the way a login would sign it.
    pub fn access_token(&self, user_id: &str) -> String {
        self.container
            .token_service
            .sign(user_id, &format!("{user_id}@example.com"), &format!("sid-{user_id}"), "jti", 0)
            .unwrap()
            .access_token
    }
}

/// Inserts a user and returns its id.
pub async fn seed_user(db: &Db, id: &str) -> String {
    sqlx::query(
        r#"INSERT INTO "User" ("id", "email", "createdAt", "updatedAt") VALUES ($1, $2, $3, $3)"#,
    )
    .bind(id)
    .bind(format!("{id}@example.com"))
    .bind(now())
    .execute(db.pool())
    .await
    .unwrap();
    id.to_string()
}

/// Inserts a live application owned by `user_id` and returns its id.
pub async fn seed_application(db: &Db, id: &str, user_id: &str) -> String {
    sqlx::query(
        r#"INSERT INTO "JobApplication" ("id", "userId", "company", "role", "createdAt", "updatedAt")
           VALUES ($1, $2, 'Acme', 'Engineer', $3, $3)"#,
    )
    .bind(id)
    .bind(user_id)
    .bind(now())
    .execute(db.pool())
    .await
    .unwrap();
    id.to_string()
}
