use axum::Json;
use serde_json::{json, Value};

/// Liveness, and Cloud Run's startup probe. Deliberately touches nothing: a
/// database outage should fail requests, not get the instance restarted.
pub async fn health() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}
