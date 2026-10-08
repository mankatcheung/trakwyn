//! Conversations through the real GraphQL endpoint and a real database.

use serde_json::{json, Value};

use trakwyn_api::domain::message::MessageRole;
use trakwyn_api::use_cases::ports::{CreateMessageData, UpsertLlmApiKeyData};

use crate::common::{seed_user, Auth, TestApp};

const CREATE: &str = "mutation($provider: String, $model: String) {
    createConversation(provider: $provider, model: $model) {
        id title llmProvider llmModel createdAt updatedAt
    }
}";
const LIST: &str = "query($limit: Int) { conversations(limit: $limit) { id title } }";
const SEARCH: &str = "query($query: String!) { searchConversations(query: $query) { id title } }";
const DELETE: &str = "mutation($id: ID!) { deleteConversation(id: $id) }";

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str) -> String {
    let response = app.graphql(CREATE, json!({}), Auth::Bearer(token)).await;
    response.data("createConversation")["id"].as_str().unwrap().to_string()
}

/// Creates a conversation with a title, a few milliseconds after the last
/// one so "newest-updated first" has an order to show.
async fn create_titled(app: &TestApp, token: &str, title: &str) -> String {
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    let id = create(app, token).await;
    app.container.conversation_repository.update_title(&id, title).await.unwrap();
    id
}

async fn add_key(app: &TestApp, user_id: &str, provider: &str) {
    app.container
        .llm_api_key_repository
        .upsert(UpsertLlmApiKeyData {
            id: format!("key-{user_id}-{provider}"),
            user_id: user_id.to_string(),
            provider: provider.to_string(),
            api_key: "encrypted".to_string(),
            model: None,
            base_url: None,
        })
        .await
        .unwrap();
}

async fn count(app: &TestApp) -> i64 {
    sqlx::query_scalar(r#"SELECT count(*) FROM "Conversation""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap()
}

fn titles(response: &Value) -> Vec<&str> {
    response.as_array().unwrap().iter().map(|c| c["title"].as_str().unwrap()).collect()
}

#[tokio::test]
async fn creates_a_conversation_with_no_locked_provider() {
    let (app, token) = app_with_owner().await;

    let response = app.graphql(CREATE, json!({}), Auth::Bearer(&token)).await;
    let created = response.data("createConversation");

    assert_eq!(created["id"].as_str().unwrap().len(), 21);
    assert_eq!(created["title"], Value::Null);
    assert_eq!(created["llmProvider"], Value::Null);
    assert_eq!(created["llmModel"], Value::Null);
    assert_eq!(created["createdAt"], created["updatedAt"]);
}

#[tokio::test]
async fn locks_in_a_provider_the_user_has_a_key_for() {
    let (app, token) = app_with_owner().await;
    add_key(&app, "owner", "openai").await;

    let response = app
        .graphql(
            CREATE,
            json!({ "provider": "openai", "model": "gpt-4o-mini" }),
            Auth::Bearer(&token),
        )
        .await;
    let created = response.data("createConversation");

    assert_eq!(created["llmProvider"], "openai");
    assert_eq!(created["llmModel"], "gpt-4o-mini");
}

#[tokio::test]
async fn a_provider_without_a_key_is_a_validation_error() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    add_key(&app, "stranger", "openai").await;

    let response = app.graphql(CREATE, json!({ "provider": "openai" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "VALIDATION");
    assert_eq!(response.error_message(), "Add an API key for this provider first");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 400);
    assert_eq!(count(&app).await, 0);
}

#[tokio::test]
async fn a_model_id_that_could_retarget_a_url_is_a_validation_error() {
    let (app, token) = app_with_owner().await;
    add_key(&app, "owner", "googleai").await;

    let response = app
        .graphql(
            CREATE,
            json!({ "provider": "googleai", "model": "../../v1/files?x=" }),
            Auth::Bearer(&token),
        )
        .await;

    assert_eq!(response.error_code(), "VALIDATION");
    assert_eq!(response.error_message(), "Model name contains characters that are not allowed");
    assert_eq!(count(&app).await, 0);
}

#[tokio::test]
async fn lists_the_users_conversations_newest_updated_first_within_the_limit() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    let first = create_titled(&app, &token, "first").await;
    create_titled(&app, &token, "second").await;
    create_titled(&app, &token, "third").await;
    create_titled(&app, &stranger, "foreign").await;

    let all = app.graphql(LIST, json!({}), Auth::Bearer(&token)).await;
    assert_eq!(titles(all.data("conversations")), vec!["third", "second", "first"]);

    let window = app.graphql(LIST, json!({ "limit": 2 }), Auth::Bearer(&token)).await;
    assert_eq!(titles(window.data("conversations")), vec!["third", "second"]);

    // Touching a conversation moves it to the top.
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    app.container.conversation_repository.update_title(&first, "first again").await.unwrap();
    let reordered = app.graphql(LIST, json!({ "limit": 1 }), Auth::Bearer(&token)).await;
    assert_eq!(titles(reordered.data("conversations")), vec!["first again"]);
}

#[tokio::test]
async fn searches_titles_and_message_contents_with_the_trimmed_term() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    create_titled(&app, &token, "Salary negotiation").await;
    let by_message = create_titled(&app, &token, "Resume review").await;
    create_titled(&app, &token, "Unrelated").await;
    create_titled(&app, &stranger, "Salary talk").await;
    app.container
        .message_repository
        .create(CreateMessageData {
            id: "m1".to_string(),
            conversation_id: by_message,
            role: MessageRole::User,
            content: "What SALARY should I ask for?".to_string(),
            tool_trace: None,
        })
        .await
        .unwrap();

    let found = app.graphql(SEARCH, json!({ "query": "  salary " }), Auth::Bearer(&token)).await;
    let mut found_titles = titles(found.data("searchConversations"));
    found_titles.sort_unstable();
    assert_eq!(found_titles, vec!["Resume review", "Salary negotiation"]);

    let blank = app.graphql(SEARCH, json!({ "query": "   " }), Auth::Bearer(&token)).await;
    assert_eq!(blank.data("searchConversations"), &json!([]));

    let nothing = app.graphql(SEARCH, json!({ "query": "zzz" }), Auth::Bearer(&token)).await;
    assert_eq!(nothing.data("searchConversations"), &json!([]));
}

#[tokio::test]
async fn deletes_a_conversation_and_a_second_delete_is_not_found() {
    let (app, token) = app_with_owner().await;
    let id = create(&app, &token).await;

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteConversation"), &Value::Bool(true));
    assert_eq!(count(&app).await, 0);

    let again = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(again.error_code(), "NOT_FOUND");
    assert_eq!(again.error_message(), "Conversation not found");
    assert_eq!(again.body["errors"][0]["extensions"]["statusCode"], 404);
}

#[tokio::test]
async fn someone_elses_conversation_is_forbidden_and_kept() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");
    let id = create(&app, &token).await;

    let response = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&stranger)).await;

    assert_eq!(response.error_code(), "FORBIDDEN");
    assert_eq!(response.error_message(), "Forbidden");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 403);
    assert_eq!(count(&app).await, 1);
}

#[tokio::test]
async fn every_operation_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    let requests = [
        (LIST, json!({})),
        (SEARCH, json!({ "query": "x" })),
        (CREATE, json!({})),
        (DELETE, json!({ "id": "x" })),
    ];

    for (query, variables) in requests {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{query}");
    }
    assert_eq!(count(&app).await, 0);
}
