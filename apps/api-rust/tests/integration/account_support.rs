//! Shared by the account-management suites (`user`, `account`, `totp`):
//! accounts with a real password, sessions of a chosen freshness, and requests
//! that carry device headers.

use std::sync::OnceLock;

use axum::body::Body;
use axum::http::header::{AUTHORIZATION, CONTENT_TYPE, SET_COOKIE, USER_AGENT};
use axum::http::Request;
use hmac::{Hmac, Mac};
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256};

use trakwyn_api::config::{Config, NodeEnv};
use trakwyn_api::infrastructure::db::Db;
use trakwyn_api::use_cases::clock::now;

use crate::common::{Response, TestApp, JWT_REFRESH_SECRET, JWT_SECRET};

pub const PASSWORD: &str = "correct-password";
pub const WRONG_PASSWORD: &str = "wrong-password";
pub const STEP_UP_MESSAGE: &str = "Please verify your identity again to continue.";
pub const USER_AGENT_VALUE: &str = "IntegrationTest/1.0";
pub const CLIENT_IP: &str = "203.0.113.7";

/// `bcryptjs@3.0.3`: `bcrypt.hashSync('correct horse battery staple', 12)`,
/// i.e. a hash exactly as `apps/api` writes it to `User.passwordHash`.
pub const NODE_PASSWORD: &str = "correct horse battery staple";
pub const NODE_PASSWORD_HASH: &str = "$2b$12$/2O8nGBuJDIB5CZeOt1xeOUoTFvOBb4R597fjwAcsUhxO/pmCplEe";

/// A hash of [`PASSWORD`] at the lowest cost: verification reads the cost
/// from the hash, so the tests do not pay for cost 12 on every request.
pub fn password_hash() -> String {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| bcrypt::hash(PASSWORD, 4).unwrap()).clone()
}

/// The test configuration plus a TOTP encryption key, which enrolment needs.
pub fn config_with_totp_key() -> Config {
    let base = Config::from_lookup(|name| match name {
        "DATABASE_URL" => Some("postgres://unused-the-pool-is-injected/test".to_string()),
        "JWT_SECRET" => Some(JWT_SECRET.to_string()),
        "JWT_REFRESH_SECRET" => Some(JWT_REFRESH_SECRET.to_string()),
        "EMAIL_PROVIDER" => Some("console".to_string()),
        "TOTP_ENCRYPTION_KEY" => Some("integration-test-totp-passphrase".to_string()),
        _ => None,
    })
    .unwrap();
    Config { port: 0, node_env: NodeEnv::Test, ..base }
}

/// Inserts `<id>@example.com` with [`PASSWORD`] and returns the id.
pub async fn seed_account(db: &Db, id: &str) -> String {
    seed_account_with_hash(db, id, Some(&password_hash())).await
}

pub async fn seed_account_with_hash(db: &Db, id: &str, hash: Option<&str>) -> String {
    sqlx::query(
        r#"INSERT INTO "User" ("id", "email", "passwordHash", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, $4)"#,
    )
    .bind(id)
    .bind(format!("{id}@example.com"))
    .bind(hash)
    .bind(now())
    .execute(db.pool())
    .await
    .unwrap();
    id.to_string()
}

/// Marks the account as having 2FA on, without a usable secret: enough for
/// the step-up checks, which only read the flag.
pub async fn enable_2fa(db: &Db, id: &str) {
    sqlx::query(r#"UPDATE "User" SET "totpEnabled" = true WHERE "id" = $1"#)
        .bind(id)
        .execute(db.pool())
        .await
        .unwrap();
}

/// An access token whose session authenticated just now.
pub fn fresh_token(app: &TestApp, user_id: &str) -> String {
    app.container
        .token_service
        .sign(
            user_id,
            &format!("{user_id}@example.com"),
            &format!("sid-{user_id}"),
            "jti",
            now().timestamp_millis(),
        )
        .unwrap()
        .access_token
}

/// An access token whose session last authenticated at the epoch.
pub fn stale_token(app: &TestApp, user_id: &str) -> String {
    app.access_token(user_id)
}

/// A GraphQL request carrying a user agent and a forwarded client address,
/// as a browser behind the load balancer would send it.
pub async fn graphql_from_device(
    app: &TestApp,
    query: &str,
    variables: Value,
    token: Option<&str>,
) -> Response {
    let mut builder = Request::post("/graphql")
        .header(CONTENT_TYPE, "application/json")
        .header(USER_AGENT, USER_AGENT_VALUE)
        .header("x-forwarded-for", format!("{CLIENT_IP}, 10.0.0.1"));
    if let Some(token) = token {
        builder = builder.header(AUTHORIZATION, format!("Bearer {token}"));
    }
    let body = json!({ "query": query, "variables": variables }).to_string();
    app.send(builder.body(Body::from(body)).unwrap()).await
}

pub fn set_cookies(response: &Response) -> Vec<String> {
    response
        .headers
        .get_all(SET_COOKIE)
        .iter()
        .map(|value| value.to_str().unwrap().to_string())
        .collect()
}

pub fn status_code(response: &Response) -> &Value {
    &response.body["errors"][0]["extensions"]["statusCode"]
}

pub fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

/// One column of one user's row, as text.
pub async fn user_column(db: &Db, id: &str, column: &str) -> Option<String> {
    sqlx::query_scalar(&format!(r#"SELECT "{column}"::text FROM "User" WHERE "id" = $1"#))
        .bind(id)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

pub async fn user_exists(db: &Db, id: &str) -> bool {
    sqlx::query_scalar(r#"SELECT EXISTS (SELECT 1 FROM "User" WHERE "id" = $1)"#)
        .bind(id)
        .fetch_one(db.pool())
        .await
        .unwrap()
}

/// `(eventType, ipAddress, userAgent)` of the user's security events, oldest first.
pub async fn security_events(
    db: &Db,
    user_id: &str,
) -> Vec<(String, Option<String>, Option<String>)> {
    sqlx::query_as(
        r#"SELECT "eventType", "ipAddress", "userAgent" FROM "SecurityEvent"
           WHERE "userId" = $1 ORDER BY "createdAt", "id""#,
    )
    .bind(user_id)
    .fetch_all(db.pool())
    .await
    .unwrap()
}

fn base32_decode(secret: &str) -> Vec<u8> {
    const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let (mut bits, mut bit_count, mut bytes) = (0u32, 0u32, Vec::new());
    for c in secret.bytes().filter(|c| *c != b'=') {
        let value = ALPHABET.iter().position(|a| *a == c).expect("a base32 character") as u32;
        bits = (bits << 5) | value;
        bit_count += 5;
        if bit_count >= 8 {
            bit_count -= 8;
            bytes.push((bits >> bit_count) as u8);
            bits &= (1 << bit_count) - 1;
        }
    }
    bytes
}

/// The RFC 6238 code an authenticator app shows right now for `secret`
/// (HMAC-SHA1, six digits, 30-second steps), computed independently of the
/// provider under test.
pub fn totp_code(secret: &str) -> String {
    let counter = (now().timestamp() / 30) as u64;
    let mut mac = Hmac::<Sha1>::new_from_slice(&base32_decode(secret)).unwrap();
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();
    let offset = (digest[19] & 0x0f) as usize;
    let binary = u32::from_be_bytes([
        digest[offset] & 0x7f,
        digest[offset + 1],
        digest[offset + 2],
        digest[offset + 3],
    ]);
    format!("{:06}", binary % 1_000_000)
}
