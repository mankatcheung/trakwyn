//! The single-shot AI features through the real GraphQL endpoint. The model
//! is a loopback stub standing in for the user's own `custom` provider.

use serde_json::{json, Value};

use crate::common::{seed_application, seed_user, Auth, TestApp};
use crate::llm_keys::{
    app_with_owner, completion, save_custom_key, seed_usage, usage_event_count, LlmStub, SAVE,
    SET_LIMIT, STUB_KEY, STUB_MODEL,
};

const GENERATE_COVER_LETTER: &str = "mutation($applicationId: ID!, $resumeText: String) {
    generateCoverLetter(applicationId: $applicationId, resumeText: $resumeText) {
        id applicationId type title contentJson plainText sourceDocumentId createdAt updatedAt
    }
}";
const GENERATE_RESUME: &str = "mutation($applicationId: ID!) {
    generateResume(applicationId: $applicationId) { id type title plainText }
}";
const GENERATE_BRIEFING: &str = "mutation($applicationId: ID!) {
    generateCompanyBriefing(applicationId: $applicationId) { id applicationId content generatedAt }
}";
const BRIEFING: &str = "query($applicationId: ID!) {
    companyBriefing(applicationId: $applicationId) { id content generatedAt }
}";
const PARSE: &str = "mutation($text: String, $url: String) {
    parseJobDescription(text: $text, url: $url) { company role location salary description }
}";
const MATCH: &str = "mutation($applicationId: ID!, $resumeText: String) {
    computeResumeMatchScore(applicationId: $applicationId, resumeText: $resumeText) {
        score label matchedKeywords missingKeywords summary
    }
}";

async fn app_with_stub(replies: Vec<(u16, Value)>) -> (TestApp, String, LlmStub) {
    let (app, token) = app_with_owner().await;
    let stub = LlmStub::start(replies).await;
    save_custom_key(&app, &token, &stub).await;
    (app, token, stub)
}

fn application_id() -> Value {
    json!({ "applicationId": "app-1" })
}

async fn seed_background(app: &TestApp) {
    sqlx::query(
        r#"INSERT INTO "WorkExperience"
             ("id", "userId", "company", "title", "startDate", "createdAt", "updatedAt")
           VALUES ('we-1', 'owner', 'Acme Corp', 'Engineer', '2020-01-15T00:00:00Z', now(), now())"#,
    )
    .execute(app.db.pool())
    .await
    .unwrap();
    sqlx::query(
        r#"INSERT INTO "Education"
             ("id", "userId", "institution", "startDate", "createdAt", "updatedAt")
           VALUES ('ed-1', 'owner', 'State University', '2012-09-01T00:00:00Z', now(), now())"#,
    )
    .execute(app.db.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn generates_a_cover_letter_draft_and_meters_the_call() {
    let (app, token, stub) = app_with_stub(vec![completion("Dear team,\n\nHello.")]).await;

    let response = app
        .graphql(
            GENERATE_COVER_LETTER,
            json!({ "applicationId": "app-1", "resumeText": "Ten years of Rust" }),
            Auth::Bearer(&token),
        )
        .await;

    let draft = response.data("generateCoverLetter");
    assert_eq!(draft["type"], "cover_letter");
    assert_eq!(draft["applicationId"], "app-1");
    assert_eq!(draft["plainText"], "Dear team,\n\nHello.");
    assert_eq!(draft["sourceDocumentId"], Value::Null);
    assert!(draft["title"].as_str().unwrap().starts_with("Acme — Engineer ("));
    assert!(draft["contentJson"].as_str().unwrap().starts_with(r#"{"type":"doc""#));
    assert_eq!(draft["createdAt"].as_str().unwrap().len(), 24);

    let request = stub.only_request();
    assert_eq!(request.body["model"], STUB_MODEL);
    assert_eq!(request.body["max_tokens"], 1024);
    assert!(request.user_prompt().ends_with("My background / resume:\nTen years of Rust"));
    assert_eq!(request.system_prompts().len(), 1);

    let (prompt, completion_tokens): (i32, i32) = sqlx::query_as(
        r#"SELECT "promptTokens", "completionTokens" FROM "LlmUsageEvent" WHERE "provider" = 'custom'"#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!((prompt, completion_tokens), (11, 3));
    let stored: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "DocumentDraft""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(stored, 1);
}

#[tokio::test]
async fn the_users_custom_prompt_becomes_a_second_system_message() {
    let (app, token, stub) = app_with_stub(vec![]).await;
    sqlx::query(r#"UPDATE "User" SET "customAiPrompt" = 'Write in British English.'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    app.graphql(GENERATE_COVER_LETTER, application_id(), Auth::Bearer(&token))
        .await
        .data("generateCoverLetter");

    assert_eq!(stub.only_request().system_prompts().last().unwrap(), "Write in British English.");
}

#[tokio::test]
async fn without_a_saved_key_ai_is_not_configured_and_nothing_is_stored() {
    let (app, token) = app_with_owner().await;

    for (query, field) in [
        (GENERATE_COVER_LETTER, "generateCoverLetter"),
        (GENERATE_BRIEFING, "generateCompanyBriefing"),
    ] {
        let response = app.graphql(query, application_id(), Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "AI_NOT_CONFIGURED", "{field}");
        assert_eq!(response.error_message(), "Add your AI API key in Settings to use this feature");
        assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 400);
    }
    let drafts: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "DocumentDraft""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(drafts, 0);
}

#[tokio::test]
async fn someone_elses_application_is_refused_before_the_provider_is_called() {
    let (app, _token, stub) = app_with_stub(vec![]).await;
    seed_user(&app.db, "stranger").await;
    let stranger = app.access_token("stranger");

    let response =
        app.graphql(GENERATE_COVER_LETTER, application_id(), Auth::Bearer(&stranger)).await;

    assert_eq!(response.error_code(), "FORBIDDEN");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 403);
    assert!(stub.requests().is_empty());
}

#[tokio::test]
async fn a_key_past_its_monthly_limit_is_refused_with_ai_limit_reached() {
    let (app, token, stub) = app_with_stub(vec![]).await;
    app.graphql(SET_LIMIT, json!({ "provider": "custom", "limit": 1000 }), Auth::Bearer(&token))
        .await
        .data("setLlmApiKeyMonthlyLimit");
    seed_usage(&app, "custom", 900, 100).await;

    let response = app.graphql(GENERATE_COVER_LETTER, application_id(), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "AI_LIMIT_REACHED");
    assert_eq!(response.error_message(), "This API key has reached its monthly token limit");
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 429);
    assert!(stub.requests().is_empty());
}

#[tokio::test]
async fn with_fallback_enabled_a_paused_key_hands_over_to_another_and_that_one_is_metered() {
    let (app, token) = app_with_owner().await;
    // OpenRouter is saved first, so it is the default; it is paused and must
    // never be called. The `custom` key pointing at the stub stands in.
    app.graphql(
        SAVE,
        json!({ "provider": "openrouter", "apiKey": "sk-or", "model": "m" }),
        Auth::Bearer(&token),
    )
    .await
    .data("saveLlmApiKey");
    let stub = LlmStub::start(vec![completion("From the stand-in.")]).await;
    save_custom_key(&app, &token, &stub).await;
    sqlx::query(r#"UPDATE "User" SET "llmFallbackWhenLimited" = true"#)
        .execute(app.db.pool())
        .await
        .unwrap();
    app.graphql(
        SET_LIMIT,
        json!({ "provider": "openrouter", "limit": 1000 }),
        Auth::Bearer(&token),
    )
    .await
    .data("setLlmApiKeyMonthlyLimit");
    seed_usage(&app, "openrouter", 1000, 0).await;

    let before = usage_event_count(&app).await;
    let response = app.graphql(GENERATE_BRIEFING, application_id(), Auth::Bearer(&token)).await;

    assert_eq!(response.data("generateCompanyBriefing")["content"], "From the stand-in.");
    assert_eq!(stub.only_request().authorization, Some(format!("Bearer {STUB_KEY}")));
    assert_eq!(usage_event_count(&app).await, before + 1);
    let provider: String = sqlx::query_scalar(
        r#"SELECT "provider" FROM "LlmUsageEvent" ORDER BY "createdAt" DESC LIMIT 1"#,
    )
    .fetch_one(app.db.pool())
    .await
    .unwrap();
    assert_eq!(provider, "custom");
}

#[tokio::test]
async fn without_fallback_the_same_paused_default_is_refused() {
    let (app, token) = app_with_owner().await;
    app.graphql(
        SAVE,
        json!({ "provider": "openrouter", "apiKey": "sk-or", "model": "m" }),
        Auth::Bearer(&token),
    )
    .await
    .data("saveLlmApiKey");
    let stub = LlmStub::start(vec![]).await;
    save_custom_key(&app, &token, &stub).await;
    app.graphql(
        SET_LIMIT,
        json!({ "provider": "openrouter", "limit": 1000 }),
        Auth::Bearer(&token),
    )
    .await
    .data("setLlmApiKeyMonthlyLimit");
    seed_usage(&app, "openrouter", 1000, 0).await;

    let response = app.graphql(GENERATE_BRIEFING, application_id(), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "AI_LIMIT_REACHED");
    assert!(stub.requests().is_empty());
}

#[tokio::test]
async fn generates_stores_and_reads_back_a_company_briefing() {
    let (app, token, stub) = app_with_stub(vec![completion("Overview\nAcme makes anvils.")]).await;

    let none = app.graphql(BRIEFING, application_id(), Auth::Bearer(&token)).await;
    assert_eq!(none.data("companyBriefing"), &Value::Null);

    let generated = app.graphql(GENERATE_BRIEFING, application_id(), Auth::Bearer(&token)).await;
    let briefing = generated.data("generateCompanyBriefing").clone();
    assert_eq!(briefing["content"], "Overview\nAcme makes anvils.");
    assert_eq!(briefing["applicationId"], "app-1");
    assert_eq!(briefing["generatedAt"].as_str().unwrap().len(), 24);
    assert_eq!(stub.only_request().body["max_tokens"], 768);

    let read = app.graphql(BRIEFING, application_id(), Auth::Bearer(&token)).await;
    assert_eq!(read.data("companyBriefing")["id"], briefing["id"]);
    assert_eq!(read.data("companyBriefing")["content"], "Overview\nAcme makes anvils.");
}

#[tokio::test]
async fn regenerating_a_briefing_replaces_it() {
    let (app, token, _stub) = app_with_stub(vec![completion("first"), completion("second")]).await;

    app.graphql(GENERATE_BRIEFING, application_id(), Auth::Bearer(&token))
        .await
        .data("generateCompanyBriefing");
    app.graphql(GENERATE_BRIEFING, application_id(), Auth::Bearer(&token))
        .await
        .data("generateCompanyBriefing");

    let rows: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "CompanyBriefing""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(rows, 1);
    let read = app.graphql(BRIEFING, application_id(), Auth::Bearer(&token)).await;
    assert_eq!(read.data("companyBriefing")["content"], "second");
}

#[tokio::test]
async fn a_briefing_for_a_trashed_or_unknown_application_is_not_found() {
    let (app, token, _stub) = app_with_stub(vec![]).await;
    sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = now() WHERE "id" = 'app-1'"#)
        .execute(app.db.pool())
        .await
        .unwrap();

    for id in ["app-1", "missing"] {
        let response =
            app.graphql(BRIEFING, json!({ "applicationId": id }), Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "NOT_FOUND");
        assert_eq!(response.error_message(), "Application not found");
    }
}

#[tokio::test]
async fn parses_a_job_posting_from_pasted_text_in_json_mode() {
    let reply = r#"{"company":"Acme","role":"Staff Engineer","location":null,"salary":"100k","description":"Build anvils."}"#;
    let (app, token, stub) = app_with_stub(vec![completion(reply)]).await;

    let response =
        app.graphql(PARSE, json!({ "text": "Staff Engineer at Acme" }), Auth::Bearer(&token)).await;

    assert_eq!(
        response.data("parseJobDescription"),
        &json!({
            "company": "Acme", "role": "Staff Engineer", "location": null,
            "salary": "100k", "description": "Build anvils."
        })
    );
    let request = stub.only_request();
    assert_eq!(request.body["response_format"], json!({ "type": "json_object" }));
    assert!(request.user_prompt().contains("<untrusted_external_content>"));
    assert!(request.user_prompt().contains("---\nStaff Engineer at Acme\n---"));
}

#[tokio::test]
async fn a_reply_that_is_not_the_expected_json_is_ai_response_invalid() {
    let (app, token, _stub) = app_with_stub(vec![completion("I cannot do that.")]).await;

    let response = app.graphql(PARSE, json!({ "text": "posting" }), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "AI_RESPONSE_INVALID");
    assert_eq!(
        response.error_message(),
        "The AI's response couldn't be understood — please try again"
    );
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 502);
}

#[tokio::test]
async fn parsing_needs_text_or_a_url() {
    let (app, token, stub) = app_with_stub(vec![]).await;

    let response = app.graphql(PARSE, json!({}), Auth::Bearer(&token)).await;

    assert!(response.body["errors"].is_array());
    assert!(stub.requests().is_empty());
}

#[tokio::test]
async fn scores_a_resume_against_the_job_description() {
    let reply = r#"{"matchPercentage":82.4,"matchedKeywords":["Rust"],"missingKeywords":["Go"],"summary":"Good fit."}"#;
    let (app, token, stub) = app_with_stub(vec![completion(reply)]).await;
    sqlx::query(
        r#"UPDATE "JobApplication" SET "description" = 'We need Rust.' WHERE "id" = 'app-1'"#,
    )
    .execute(app.db.pool())
    .await
    .unwrap();

    let response = app
        .graphql(
            MATCH,
            json!({ "applicationId": "app-1", "resumeText": "Ten years of Rust" }),
            Auth::Bearer(&token),
        )
        .await;

    assert_eq!(
        response.data("computeResumeMatchScore"),
        &json!({
            "score": 82, "label": "Good match", "matchedKeywords": ["Rust"],
            "missingKeywords": ["Go"], "summary": "Good fit."
        })
    );
    assert!(stub.only_request().user_prompt().ends_with("Resume:\nTen years of Rust"));
}

#[tokio::test]
async fn scoring_needs_a_job_description_and_some_resume_source() {
    let (app, token, stub) = app_with_stub(vec![]).await;

    let no_description = app
        .graphql(
            MATCH,
            json!({ "applicationId": "app-1", "resumeText": "x" }),
            Auth::Bearer(&token),
        )
        .await;
    assert_eq!(no_description.error_code(), "VALIDATION");
    assert_eq!(
        no_description.error_message(),
        "Add a job description to this application before checking resume match"
    );

    sqlx::query(
        r#"UPDATE "JobApplication" SET "description" = 'We need Rust.' WHERE "id" = 'app-1'"#,
    )
    .execute(app.db.pool())
    .await
    .unwrap();
    let no_resume = app.graphql(MATCH, application_id(), Auth::Bearer(&token)).await;
    assert_eq!(no_resume.error_code(), "VALIDATION");
    assert_eq!(
        no_resume.error_message(),
        "Upload a resume, paste your resume text, or add work experience and skills to your profile"
    );
    assert!(stub.requests().is_empty());
}

#[tokio::test]
async fn generates_a_resume_draft_grounded_in_the_users_background() {
    let reply = json!({
        "summary": "Backend engineer.",
        "experience": [{ "company": "acme corp", "title": "Engineer", "bullets": ["Built it."] }],
        "education": [{ "institution": "State University" }],
        "skills": []
    })
    .to_string();
    let (app, token, stub) = app_with_stub(vec![completion(&reply)]).await;
    seed_background(&app).await;

    let response = app.graphql(GENERATE_RESUME, application_id(), Auth::Bearer(&token)).await;

    let draft = response.data("generateResume");
    assert_eq!(draft["type"], "resume");
    assert!(draft["plainText"]
        .as_str()
        .unwrap()
        .starts_with("Summary\nBackend engineer.\n\nExperience\nEngineer — acme corp"));
    let request = stub.only_request();
    assert_eq!(request.body["max_tokens"], 2048);
    assert_eq!(request.body["response_format"], json!({ "type": "json_object" }));
    assert!(request.user_prompt().contains("- Engineer at Acme Corp (1/15/2020 – Present)"));
}

#[tokio::test]
async fn an_invented_employer_is_refused_and_nothing_is_saved() {
    let reply = json!({
        "experience": [{ "company": "Globex", "title": "CEO", "bullets": [] }],
        "education": [],
        "skills": []
    })
    .to_string();
    let (app, token, _stub) = app_with_stub(vec![completion(&reply)]).await;
    seed_background(&app).await;

    let response = app.graphql(GENERATE_RESUME, application_id(), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "AI_RESPONSE_INVALID");
    assert!(response.error_message().contains("nothing was saved"));
    let drafts: i64 = sqlx::query_scalar(r#"SELECT count(*) FROM "DocumentDraft""#)
        .fetch_one(app.db.pool())
        .await
        .unwrap();
    assert_eq!(drafts, 0);
}

#[tokio::test]
async fn a_resume_needs_some_recorded_background() {
    let (app, token, stub) = app_with_stub(vec![]).await;

    let response = app.graphql(GENERATE_RESUME, application_id(), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "VALIDATION");
    assert!(stub.requests().is_empty());
}

#[tokio::test]
async fn every_ai_operation_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    seed_application(&app.db, "app-2", "owner").await;
    let operations = [
        (GENERATE_COVER_LETTER, "generateCoverLetter"),
        (GENERATE_RESUME, "generateResume"),
        (GENERATE_BRIEFING, "generateCompanyBriefing"),
        (BRIEFING, "companyBriefing"),
        (MATCH, "computeResumeMatchScore"),
    ];
    for (query, field) in operations {
        let response = app.graphql(query, application_id(), Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
    }
    let parse = app.graphql(PARSE, json!({ "text": "x" }), Auth::None).await;
    assert_eq!(parse.error_code(), "UNAUTHORIZED");
}
