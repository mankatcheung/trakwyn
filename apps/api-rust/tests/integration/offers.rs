//! Offers, their comparison and their analytics through the real GraphQL
//! endpoint and a real database.

use serde_json::{json, Value};

use crate::common::{seed_application, seed_user, Auth, TestApp};

const FIELDS: &str = "id applicationId baseSalary bonus equity benefits costOfLivingAdjustment \
                      currency period notes createdAt updatedAt";
const LIST: &str =
    "query($applicationId: ID!) { offers(applicationId: $applicationId) { id baseSalary } }";
const MY_OFFERS: &str = "query { myOffers { company role offer { id baseSalary } } }";
const DELETE: &str = "mutation($id: String!) { deleteOffer(id: $id) }";
const COMPARE: &str = "mutation($offerIds: [String!]!) {
    compareOffers(offerIds: $offerIds) {
        company role normalizedYearlySalary totalCompensation offer { id period }
    }
}";
const ANALYTICS: &str = "query {
    offerAnalytics {
        trend { offerId applicationId company role createdAt currency normalizedYearlySalary }
        byCurrency {
            currency count minYearlySalary maxYearlySalary medianYearlySalary averageYearlySalary
        }
    }
}";

fn create_query() -> String {
    format!("mutation($input: CreateOfferInput!) {{ createOffer(input: $input) {{ {FIELDS} }} }}")
}

fn update_query() -> String {
    format!("mutation($input: UpdateOfferInput!) {{ updateOffer(input: $input) {{ {FIELDS} }} }}")
}

async fn app_with_owner() -> (TestApp, String) {
    let app = TestApp::start().await;
    seed_user(&app.db, "owner").await;
    seed_application(&app.db, "app-1", "owner").await;
    let token = app.access_token("owner");
    (app, token)
}

async fn create(app: &TestApp, token: &str, input: Value) -> Value {
    app.graphql(&create_query(), json!({ "input": input }), Auth::Bearer(token))
        .await
        .data("createOffer")
        .clone()
}

/// Creates an offer and returns its id.
async fn offer(app: &TestApp, token: &str, input: Value) -> String {
    let created = create(app, token, input).await;
    // Analytics order by creation time, to the millisecond.
    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    created["id"].as_str().unwrap().to_string()
}

async fn stranger_token(app: &TestApp) -> String {
    seed_user(&app.db, "stranger").await;
    app.access_token("stranger")
}

async fn rename_application(app: &TestApp, id: &str, company: &str, role: &str) {
    sqlx::query(r#"UPDATE "JobApplication" SET "company" = $2, "role" = $3 WHERE "id" = $1"#)
        .bind(id)
        .bind(company)
        .bind(role)
        .execute(app.db.pool())
        .await
        .unwrap();
}

fn is_uuid_v4(id: &str) -> bool {
    let groups: Vec<&str> = id.split('-').collect();
    groups.iter().map(|group| group.len()).collect::<Vec<_>>() == [8, 4, 4, 4, 12]
        && groups[2].starts_with('4')
        && id.chars().all(|c| c == '-' || c.is_ascii_hexdigit())
}

#[tokio::test]
async fn creates_an_offer_with_the_contract_defaults() {
    let (app, token) = app_with_owner().await;

    let created =
        create(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 120000 })).await;

    // Offer ids are UUIDs, unlike every other entity's nanoid.
    assert!(is_uuid_v4(created["id"].as_str().unwrap()), "id: {}", created["id"]);
    assert_eq!(created["applicationId"], "app-1");
    assert_eq!(created["baseSalary"], 120000);
    assert_eq!(created["currency"], "USD");
    assert_eq!(created["period"], "yearly");
    for field in ["bonus", "equity", "benefits", "costOfLivingAdjustment", "notes"] {
        assert_eq!(created[field], Value::Null, "{field}");
    }
    assert_eq!(created["createdAt"].as_str().unwrap().len(), 24);
    assert_eq!(created["createdAt"], created["updatedAt"]);
}

#[tokio::test]
async fn creates_an_offer_with_every_field_named() {
    let (app, token) = app_with_owner().await;

    let created = create(
        &app,
        &token,
        json!({
            "applicationId": "app-1",
            "baseSalary": 9000,
            "bonus": 500,
            "equity": "0.1%",
            "benefits": "Health",
            "costOfLivingAdjustment": 3,
            "currency": "EUR",
            "period": "monthly",
            "notes": "Verbal",
        }),
    )
    .await;

    assert_eq!(created["baseSalary"], 9000);
    assert_eq!(created["bonus"], 500);
    assert_eq!(created["equity"], "0.1%");
    assert_eq!(created["benefits"], "Health");
    assert_eq!(created["costOfLivingAdjustment"], 3);
    assert_eq!(created["currency"], "EUR");
    assert_eq!(created["period"], "monthly");
    assert_eq!(created["notes"], "Verbal");
}

#[tokio::test]
async fn a_null_currency_and_period_store_the_defaults() {
    let (app, token) = app_with_owner().await;

    let created = create(
        &app,
        &token,
        json!({ "applicationId": "app-1", "baseSalary": 1, "currency": null, "period": null }),
    )
    .await;

    assert_eq!(created["currency"], "USD");
    assert_eq!(created["period"], "yearly");
}

#[tokio::test]
async fn an_unknown_period_is_a_validation_error() {
    let (app, token) = app_with_owner().await;

    let response = app
        .graphql(
            &create_query(),
            json!({ "input": { "applicationId": "app-1", "baseSalary": 1, "period": "daily" } }),
            Auth::Bearer(&token),
        )
        .await;

    assert_eq!(response.error_code(), "VALIDATION");
    assert_eq!(
        response.error_message(),
        "Invalid offer period. Must be one of: yearly, monthly, weekly, hourly"
    );
    assert_eq!(response.body["errors"][0]["extensions"]["statusCode"], 400);
}

#[tokio::test]
async fn lists_an_applications_offers() {
    let (app, token) = app_with_owner().await;
    seed_application(&app.db, "app-2", "owner").await;
    let id = offer(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 100 })).await;
    offer(&app, &token, json!({ "applicationId": "app-2", "baseSalary": 200 })).await;

    let response =
        app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("offers"), &json!([{ "id": id, "baseSalary": 100 }]));
}

#[tokio::test]
async fn my_offers_pairs_each_offer_with_its_application_and_skips_trashed_ones() {
    let (app, token) = app_with_owner().await;
    seed_application(&app.db, "app-2", "owner").await;
    seed_application(&app.db, "app-trashed", "owner").await;
    rename_application(&app, "app-2", "Globex", "Staff Engineer").await;
    offer(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 100 })).await;
    offer(&app, &token, json!({ "applicationId": "app-2", "baseSalary": 200 })).await;
    offer(&app, &token, json!({ "applicationId": "app-trashed", "baseSalary": 300 })).await;
    sqlx::query(r#"UPDATE "JobApplication" SET "deletedAt" = now() WHERE "id" = 'app-trashed'"#)
        .execute(app.db.pool())
        .await
        .unwrap();
    let stranger = stranger_token(&app).await;
    seed_application(&app.db, "app-foreign", "stranger").await;
    offer(&app, &stranger, json!({ "applicationId": "app-foreign", "baseSalary": 400 })).await;

    let response = app.graphql(MY_OFFERS, json!({}), Auth::Bearer(&token)).await;

    let mut rows: Vec<(String, String, i64)> = response
        .data("myOffers")
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            (
                row["company"].as_str().unwrap().to_string(),
                row["role"].as_str().unwrap().to_string(),
                row["offer"]["baseSalary"].as_i64().unwrap(),
            )
        })
        .collect();
    // The query promises no order.
    rows.sort();
    assert_eq!(
        rows,
        vec![
            ("Acme".to_string(), "Engineer".to_string(), 100),
            ("Globex".to_string(), "Staff Engineer".to_string(), 200),
        ]
    );
}

#[tokio::test]
async fn an_update_writes_named_fields_and_cannot_clear_one_with_null() {
    let (app, token) = app_with_owner().await;
    let id = offer(
        &app,
        &token,
        json!({ "applicationId": "app-1", "baseSalary": 100, "bonus": 10, "notes": "Verbal" }),
    )
    .await;

    let response = app
        .graphql(
            &update_query(),
            json!({ "input": {
                "offerId": id,
                "baseSalary": 150,
                "period": "hourly",
                "currency": "GBP",
                "bonus": null,
                "notes": null,
            } }),
            Auth::Bearer(&token),
        )
        .await;

    let updated = response.data("updateOffer");
    assert_eq!(updated["baseSalary"], 150);
    assert_eq!(updated["period"], "hourly");
    assert_eq!(updated["currency"], "GBP");
    // A null reads as "left out" here.
    assert_eq!(updated["bonus"], 10);
    assert_eq!(updated["notes"], "Verbal");
}

#[tokio::test]
async fn deletes_an_offer() {
    let (app, token) = app_with_owner().await;
    let id = offer(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 100 })).await;

    let deleted = app.graphql(DELETE, json!({ "id": id }), Auth::Bearer(&token)).await;
    assert_eq!(deleted.data("deleteOffer"), &Value::Bool(true));

    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("offers"), &json!([]));
}

#[tokio::test]
async fn every_operation_is_unauthorized_without_a_user() {
    let (app, token) = app_with_owner().await;
    let id = offer(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 100 })).await;

    let requests = [
        (LIST.to_string(), json!({ "applicationId": "app-1" }), "offers"),
        (MY_OFFERS.to_string(), json!({}), "myOffers"),
        (ANALYTICS.to_string(), json!({}), "offerAnalytics"),
        (
            create_query(),
            json!({ "input": { "applicationId": "app-1", "baseSalary": 1 } }),
            "createOffer",
        ),
        (update_query(), json!({ "input": { "offerId": id } }), "updateOffer"),
        (DELETE.to_string(), json!({ "id": id }), "deleteOffer"),
        (COMPARE.to_string(), json!({ "offerIds": [id] }), "compareOffers"),
    ];
    for (query, variables, field) in requests {
        let response = app.graphql(&query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.body["data"][field], Value::Null, "{field}");
    }
}

#[tokio::test]
async fn someone_elses_application_reads_as_missing_to_list_and_create() {
    let (app, _token) = app_with_owner().await;
    let stranger = stranger_token(&app).await;

    let requests = [
        (LIST.to_string(), json!({ "applicationId": "app-1" })),
        (LIST.to_string(), json!({ "applicationId": "missing" })),
        (create_query(), json!({ "input": { "applicationId": "app-1", "baseSalary": 1 } })),
    ];
    for (query, variables) in requests {
        let response = app.graphql(&query, variables, Auth::Bearer(&stranger)).await;
        assert_eq!(response.error_code(), "NOT_FOUND", "{query}");
        assert_eq!(response.error_message(), "Application not found");
    }
}

#[tokio::test]
async fn someone_elses_offer_is_forbidden_and_an_unknown_one_not_found() {
    let (app, token) = app_with_owner().await;
    let id = offer(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 100 })).await;
    let stranger = stranger_token(&app).await;

    let update = update_query();
    for (query, variables) in [
        (update.as_str(), json!({ "input": { "offerId": id, "baseSalary": 1 } })),
        (DELETE, json!({ "id": id })),
    ] {
        let response = app.graphql(query, variables, Auth::Bearer(&stranger)).await;
        assert_eq!(response.error_code(), "FORBIDDEN", "{query}");
        assert_eq!(response.error_message(), "Not authorized");
    }
    for (query, variables) in [
        (update.as_str(), json!({ "input": { "offerId": "missing" } })),
        (DELETE, json!({ "id": "missing" })),
    ] {
        let response = app.graphql(query, variables, Auth::Bearer(&token)).await;
        assert_eq!(response.error_code(), "NOT_FOUND", "{query}");
        assert_eq!(response.error_message(), "Offer not found");
    }

    let listed = app.graphql(LIST, json!({ "applicationId": "app-1" }), Auth::Bearer(&token)).await;
    assert_eq!(listed.data("offers")[0]["baseSalary"], 100);
}

#[tokio::test]
async fn compares_offers_by_annualized_total_highest_first() {
    let (app, token) = app_with_owner().await;
    seed_application(&app.db, "app-2", "owner").await;
    rename_application(&app, "app-2", "Globex", "Staff Engineer").await;
    let yearly = offer(
        &app,
        &token,
        json!({ "applicationId": "app-1", "baseSalary": 120000, "bonus": 10000 }),
    )
    .await;
    let monthly = offer(
        &app,
        &token,
        json!({ "applicationId": "app-2", "baseSalary": 11000, "bonus": 1000, "period": "monthly" }),
    )
    .await;
    let hourly = offer(
        &app,
        &token,
        json!({ "applicationId": "app-1", "baseSalary": 50, "period": "hourly" }),
    )
    .await;

    let response = app
        .graphql(COMPARE, json!({ "offerIds": [hourly, yearly, monthly] }), Auth::Bearer(&token))
        .await;

    // A bonus is annualized by the offer's period, like the salary.
    assert_eq!(
        response.data("compareOffers"),
        &json!([
            {
                "company": "Globex",
                "role": "Staff Engineer",
                "normalizedYearlySalary": 132000,
                "totalCompensation": 144000,
                "offer": { "id": monthly, "period": "monthly" },
            },
            {
                "company": "Acme",
                "role": "Engineer",
                "normalizedYearlySalary": 120000,
                "totalCompensation": 130000,
                "offer": { "id": yearly, "period": "yearly" },
            },
            {
                "company": "Acme",
                "role": "Engineer",
                "normalizedYearlySalary": 104000,
                "totalCompensation": 104000,
                "offer": { "id": hourly, "period": "hourly" },
            },
        ])
    );
}

#[tokio::test]
async fn comparing_no_offers_is_an_empty_list() {
    let (app, token) = app_with_owner().await;

    let response = app.graphql(COMPARE, json!({ "offerIds": [] }), Auth::Bearer(&token)).await;

    assert_eq!(response.data("compareOffers"), &json!([]));
}

#[tokio::test]
async fn a_comparison_names_the_offer_that_is_missing_or_not_the_users() {
    let (app, token) = app_with_owner().await;
    let id = offer(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 100 })).await;
    let stranger = stranger_token(&app).await;

    let missing =
        app.graphql(COMPARE, json!({ "offerIds": [id, "nope"] }), Auth::Bearer(&token)).await;
    assert_eq!(missing.error_code(), "NOT_FOUND");
    assert_eq!(missing.error_message(), "Offer nope not found");

    let foreign = app.graphql(COMPARE, json!({ "offerIds": [id] }), Auth::Bearer(&stranger)).await;
    assert_eq!(foreign.error_code(), "FORBIDDEN");
    assert_eq!(foreign.error_message(), format!("Not authorized for offer {id}"));
}

#[tokio::test]
async fn an_annualized_figure_too_large_for_an_int_fails_that_field_only() {
    let (app, token) = app_with_owner().await;
    let id = offer(
        &app,
        &token,
        json!({ "applicationId": "app-1", "baseSalary": 2000000, "period": "hourly" }),
    )
    .await;

    let response = app.graphql(COMPARE, json!({ "offerIds": [id] }), Auth::Bearer(&token)).await;

    let row = &response.body["data"]["compareOffers"][0];
    assert_eq!(row["company"], "Acme");
    assert_eq!(row["normalizedYearlySalary"], Value::Null);
    assert_eq!(row["totalCompensation"], Value::Null);
    assert_eq!(
        response.error_message(),
        "Int cannot represent non 32-bit signed integer value: 4160000000"
    );
}

#[tokio::test]
async fn analytics_are_empty_for_a_user_with_no_offers() {
    let (app, token) = app_with_owner().await;

    let response = app.graphql(ANALYTICS, json!({}), Auth::Bearer(&token)).await;

    assert_eq!(response.data("offerAnalytics"), &json!({ "trend": [], "byCurrency": [] }));
}

#[tokio::test]
async fn analytics_trend_is_chronological_and_figures_are_grouped_by_currency() {
    let (app, token) = app_with_owner().await;
    seed_application(&app.db, "app-2", "owner").await;
    rename_application(&app, "app-2", "Globex", "Staff Engineer").await;
    let eur = offer(
        &app,
        &token,
        json!({ "applicationId": "app-2", "baseSalary": 7500, "period": "monthly", "currency": "EUR" }),
    )
    .await;
    let usd_a =
        offer(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 100000 })).await;
    let usd_b = offer(
        &app,
        &token,
        json!({ "applicationId": "app-1", "baseSalary": 50, "period": "hourly" }),
    )
    .await;
    let usd_c = offer(
        &app,
        &token,
        json!({ "applicationId": "app-2", "baseSalary": 2500, "period": "weekly" }),
    )
    .await;
    let usd_d =
        offer(&app, &token, json!({ "applicationId": "app-1", "baseSalary": 121001 })).await;

    let response = app.graphql(ANALYTICS, json!({}), Auth::Bearer(&token)).await;
    let analytics = response.data("offerAnalytics");

    let trend: Vec<(&str, &str, &str, f64)> = analytics["trend"]
        .as_array()
        .unwrap()
        .iter()
        .map(|point| {
            (
                point["offerId"].as_str().unwrap(),
                point["company"].as_str().unwrap(),
                point["currency"].as_str().unwrap(),
                point["normalizedYearlySalary"].as_f64().unwrap(),
            )
        })
        .collect();
    assert_eq!(
        trend,
        vec![
            (eur.as_str(), "Globex", "EUR", 90000.0),
            (usd_a.as_str(), "Acme", "USD", 100000.0),
            (usd_b.as_str(), "Acme", "USD", 104000.0),
            (usd_c.as_str(), "Globex", "USD", 130000.0),
            (usd_d.as_str(), "Acme", "USD", 121001.0),
        ]
    );
    assert_eq!(analytics["trend"][0]["applicationId"], "app-2");
    assert_eq!(analytics["trend"][0]["role"], "Staff Engineer");
    assert_eq!(analytics["trend"][0]["createdAt"].as_str().unwrap().len(), 24);

    // The larger group first; the median of four is the mean of the middle pair.
    assert_eq!(
        analytics["byCurrency"],
        json!([
            {
                "currency": "USD",
                "count": 4,
                "minYearlySalary": 100000.0,
                "maxYearlySalary": 130000.0,
                "medianYearlySalary": 112500.5,
                "averageYearlySalary": 113750.25,
            },
            {
                "currency": "EUR",
                "count": 1,
                "minYearlySalary": 90000.0,
                "maxYearlySalary": 90000.0,
                "medianYearlySalary": 90000.0,
                "averageYearlySalary": 90000.0,
            },
        ])
    );
}
