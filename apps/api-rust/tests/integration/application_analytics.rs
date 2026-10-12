//! The read-only figures over a user's applications, through the real
//! GraphQL endpoint and a real database: activity logs, the calendar, the
//! health score, channel and response-time analytics and the weekly goal.

use chrono::{DateTime, TimeDelta, Utc};
use serde_json::{json, Value};

use crate::applications::{app_with_owner, create};
use crate::common::{seed_application, seed_user, Auth, TestApp};

const ACTIVITY: &str = "query($applicationId: ID!) {
    activityLogs(applicationId: $applicationId) {
        id applicationId actorId eventType payload createdAt
    }
}";
const CALENDAR: &str =
    "query { calendarEvents { id applicationId company role type date interviewRoundType } }";
const HEALTH: &str = "query($applicationId: ID!) {
    applicationHealthScore(applicationId: $applicationId) {
        score label criteria { key label points earned met }
    }
}";
const CHANNELS: &str = "query { applicationChannelAnalytics {
    bySource { label applicationCount respondedCount responseRate offerCount offerRate }
    byTag { label applicationCount respondedCount responseRate offerCount offerRate }
} }";
const RESPONSE_TIMES: &str = "query { responseTimeAnalytics {
    timeInStage { status averageDays medianDays sampleSize }
    timeToFirstResponse { averageDays medianDays sampleSize }
} }";
const WEEKLY_GOAL: &str = "query { weeklyApplicationGoal {
    weeklyApplicationGoal currentWeekCount currentWeekStart streakWeeks
} }";
const UPDATE: &str = "mutation($id: ID!, $input: UpdateApplicationInput!) {
    updateApplication(id: $id, input: $input) { id }
}";

fn day(n: i64) -> DateTime<Utc> {
    "2026-03-02T00:00:00Z".parse::<DateTime<Utc>>().unwrap() + TimeDelta::days(n)
}

async fn set_dates(
    app: &TestApp,
    id: &str,
    created: DateTime<Utc>,
    applied: Option<DateTime<Utc>>,
) {
    sqlx::query(
        r#"UPDATE "JobApplication" SET "createdAt" = $2, "appliedAt" = $3 WHERE "id" = $1"#,
    )
    .bind(id)
    .bind(created)
    .bind(applied)
    .execute(app.db.pool())
    .await
    .unwrap();
}

async fn seed_status_change(
    app: &TestApp,
    application_id: &str,
    from: &str,
    to: &str,
    on: DateTime<Utc>,
) {
    sqlx::query(
        r#"INSERT INTO "ActivityLog" ("id", "applicationId", "actorId", "eventType", "payload", "createdAt")
           VALUES ($1, $2, 'owner', 'status_changed', $3, $4)"#,
    )
    .bind(nanoid::nanoid!())
    .bind(application_id)
    .bind(json!({ "from": from, "to": to }).to_string())
    .bind(on)
    .execute(app.db.pool())
    .await
    .unwrap();
}

async fn seed_round(
    app: &TestApp,
    id: &str,
    application_id: &str,
    scheduled: Option<DateTime<Utc>>,
) {
    sqlx::query(
        r#"INSERT INTO "InterviewRound" ("id", "applicationId", "type", "scheduledAt", "createdAt", "updatedAt")
           VALUES ($1, $2, 'technical', $3, $4, $4)"#,
    )
    .bind(id)
    .bind(application_id)
    .bind(scheduled)
    .bind(day(0))
    .execute(app.db.pool())
    .await
    .unwrap();
}

#[tokio::test]
async fn every_query_needs_a_signed_in_user() {
    let (app, _token) = app_with_owner().await;
    let queries = [
        (ACTIVITY, "activityLogs", json!({ "applicationId": "a" })),
        (CALENDAR, "calendarEvents", json!({})),
        (HEALTH, "applicationHealthScore", json!({ "applicationId": "a" })),
        (CHANNELS, "applicationChannelAnalytics", json!({})),
        (RESPONSE_TIMES, "responseTimeAnalytics", json!({})),
        (WEEKLY_GOAL, "weeklyApplicationGoal", json!({})),
    ];

    for (query, field, variables) in queries {
        let response = app.graphql(query, variables, Auth::None).await;
        assert_eq!(response.error_code(), "UNAUTHORIZED", "{field}");
        assert_eq!(response.body["data"][field], Value::Null, "{field}");
    }
}

#[tokio::test]
async fn activity_logs_list_what_happened_to_an_application() {
    let (app, token) = app_with_owner().await;
    let created = create(&app, &token, json!({ "company": "Acme", "role": "Engineer" })).await;
    let id = created["id"].as_str().unwrap();
    app.graphql(
        UPDATE,
        json!({ "id": id, "input": { "status": "applied" } }),
        Auth::Bearer(&token),
    )
    .await
    .data("updateApplication");

    let response =
        app.graphql(ACTIVITY, json!({ "applicationId": id }), Auth::Bearer(&token)).await;

    let logs = response.data("activityLogs").as_array().unwrap();
    assert_eq!(logs.len(), 1);
    assert_eq!(logs[0]["applicationId"], id);
    assert_eq!(logs[0]["actorId"], "owner");
    assert_eq!(logs[0]["eventType"], "status_changed");
    assert_eq!(logs[0]["payload"], r#"{"from":"draft","to":"applied"}"#);
    assert_eq!(logs[0]["createdAt"].as_str().unwrap().len(), 24);
}

#[tokio::test]
async fn activity_logs_and_the_health_score_refuse_missing_and_foreign_applications() {
    let (app, token) = app_with_owner().await;
    seed_user(&app.db, "stranger").await;
    seed_application(&app.db, "theirs", "stranger").await;

    for query in [ACTIVITY, HEALTH] {
        let missing =
            app.graphql(query, json!({ "applicationId": "missing" }), Auth::Bearer(&token)).await;
        assert_eq!(missing.error_code(), "NOT_FOUND");
        assert_eq!(missing.error_message(), "Application not found");

        let foreign =
            app.graphql(query, json!({ "applicationId": "theirs" }), Auth::Bearer(&token)).await;
        assert_eq!(foreign.error_code(), "FORBIDDEN");
    }
}

#[tokio::test]
async fn the_calendar_merges_applied_follow_up_and_interview_dates() {
    let (app, token) = app_with_owner().await;
    seed_application(&app.db, "a", "owner").await;
    sqlx::query(
        r#"UPDATE "JobApplication" SET "appliedAt" = $1, "followUpAt" = $2 WHERE "id" = 'a'"#,
    )
    .bind(day(3))
    .bind(day(1))
    .execute(app.db.pool())
    .await
    .unwrap();
    seed_round(&app, "round-1", "a", Some(day(2))).await;
    seed_round(&app, "unscheduled", "a", None).await;

    let response = app.graphql(CALENDAR, json!({}), Auth::Bearer(&token)).await;

    assert_eq!(
        response.data("calendarEvents"),
        &json!([
            {
                "id": "a-follow-up", "applicationId": "a", "company": "Acme", "role": "Engineer",
                "type": "followUp", "date": "2026-03-03T00:00:00.000Z", "interviewRoundType": null,
            },
            {
                "id": "round-1", "applicationId": "a", "company": "Acme", "role": "Engineer",
                "type": "interview", "date": "2026-03-04T00:00:00.000Z",
                "interviewRoundType": "technical",
            },
            {
                "id": "a-applied", "applicationId": "a", "company": "Acme", "role": "Engineer",
                "type": "applied", "date": "2026-03-05T00:00:00.000Z", "interviewRoundType": null,
            },
        ])
    );
}

#[tokio::test]
async fn the_health_score_breaks_down_what_an_application_has() {
    let (app, token) = app_with_owner().await;
    let created = create(
        &app,
        &token,
        json!({ "company": "Acme", "role": "Engineer", "description": "About", "jobUrl": "https://a.example" }),
    )
    .await;
    let id = created["id"].as_str().unwrap();
    let note = "mutation($id: ID!) { createNote(applicationId: $id, content: \"hi\") { id } }";
    app.graphql(note, json!({ "id": id }), Auth::Bearer(&token)).await.data("createNote");

    let response = app.graphql(HEALTH, json!({ "applicationId": id }), Auth::Bearer(&token)).await;
    let score = response.data("applicationHealthScore");

    // description 20 + notes 10 + job URL 5.
    assert_eq!(score["score"], 35);
    assert_eq!(score["label"], "Needs attention");
    assert_eq!(score["criteria"].as_array().unwrap().len(), 11);
    assert_eq!(
        score["criteria"][0],
        json!({
            "key": "description", "label": "Job description captured",
            "points": 20, "earned": 20, "met": true,
        })
    );
    assert_eq!(score["criteria"][1]["met"], false);
}

#[tokio::test]
async fn channel_analytics_group_by_source_and_tag() {
    let (app, token) = app_with_owner().await;
    for (source, status, tags) in [
        (json!("LinkedIn"), "offered", json!(["remote"])),
        (json!(" linkedin "), "applied", json!(["Remote", "startup"])),
        (Value::Null, "draft", json!([])),
    ] {
        create(
            &app,
            &token,
            json!({ "company": "C", "role": "R", "source": source, "status": status, "tags": tags }),
        )
        .await;
        tokio::time::sleep(std::time::Duration::from_millis(5)).await;
    }

    let response = app.graphql(CHANNELS, json!({}), Auth::Bearer(&token)).await;
    let analytics = response.data("applicationChannelAnalytics");

    assert_eq!(
        analytics["bySource"],
        json!([
            // Newest first, so the trimmed lowercase spelling was seen first.
            {
                "label": "linkedin", "applicationCount": 2, "respondedCount": 1,
                "responseRate": 50, "offerCount": 1, "offerRate": 50,
            },
            {
                "label": "(no source)", "applicationCount": 1, "respondedCount": 0,
                "responseRate": 0, "offerCount": 0, "offerRate": 0,
            },
        ])
    );
    let tags: Vec<(&str, i64)> = analytics["byTag"]
        .as_array()
        .unwrap()
        .iter()
        .map(|group| {
            (group["label"].as_str().unwrap(), group["applicationCount"].as_i64().unwrap())
        })
        .collect();
    assert_eq!(tags.len(), 2);
    assert!(tags.contains(&("startup", 1)));
    assert_eq!(tags[0].1, 2);
    assert_eq!(tags[0].0.to_lowercase(), "remote");
}

#[tokio::test]
async fn response_times_come_from_the_status_history() {
    let (app, token) = app_with_owner().await;
    seed_application(&app.db, "a", "owner").await;
    set_dates(&app, "a", day(0), Some(day(2))).await;
    seed_status_change(&app, "a", "draft", "applied", day(2)).await;
    seed_status_change(&app, "a", "applied", "interviewing", day(5)).await;
    seed_application(&app.db, "b", "owner").await;
    set_dates(&app, "b", day(0), Some(day(0))).await;
    seed_status_change(&app, "b", "applied", "rejected", day(6)).await;

    let response = app.graphql(RESPONSE_TIMES, json!({}), Auth::Bearer(&token)).await;
    let analytics = response.data("responseTimeAnalytics");

    assert_eq!(
        analytics["timeInStage"],
        json!([
            // a left "applied" after 3 days, b after 6.
            { "status": "applied", "averageDays": 4.5, "medianDays": 4.5, "sampleSize": 2 },
            { "status": "draft", "averageDays": 2.0, "medianDays": 2.0, "sampleSize": 1 },
        ])
    );
    assert_eq!(
        analytics["timeToFirstResponse"],
        json!({ "averageDays": 4.5, "medianDays": 4.5, "sampleSize": 2 })
    );
}

#[tokio::test]
async fn response_times_are_empty_without_history() {
    let (app, token) = app_with_owner().await;

    let response = app.graphql(RESPONSE_TIMES, json!({}), Auth::Bearer(&token)).await;

    assert_eq!(
        response.data("responseTimeAnalytics"),
        &json!({
            "timeInStage": [],
            "timeToFirstResponse": { "averageDays": null, "medianDays": null, "sampleSize": 0 },
        })
    );
}

#[tokio::test]
async fn the_weekly_goal_counts_this_weeks_applications() {
    let (app, token) = app_with_owner().await;
    create(&app, &token, json!({ "company": "Acme", "role": "Engineer" })).await;
    seed_application(&app.db, "old", "owner").await;
    sqlx::query(r#"UPDATE "JobApplication" SET "createdAt" = $1 WHERE "id" = 'old'"#)
        .bind(day(0))
        .execute(app.db.pool())
        .await
        .unwrap();

    let response = app.graphql(WEEKLY_GOAL, json!({}), Auth::Bearer(&token)).await;
    let goal = response.data("weeklyApplicationGoal");

    assert_eq!(goal["weeklyApplicationGoal"], 5);
    assert_eq!(goal["currentWeekCount"], 1);
    assert_eq!(goal["streakWeeks"], 0);
    let week_start: DateTime<Utc> = goal["currentWeekStart"].as_str().unwrap().parse().unwrap();
    assert!(goal["currentWeekStart"].as_str().unwrap().ends_with("T00:00:00.000Z"));
    assert_eq!(chrono::Datelike::weekday(&week_start), chrono::Weekday::Mon);
    assert!(Utc::now() - week_start < TimeDelta::days(7));
}

#[tokio::test]
async fn the_weekly_goal_of_a_user_that_no_longer_exists_is_not_found() {
    let app = TestApp::start().await;
    let token = app.access_token("ghost");

    let response = app.graphql(WEEKLY_GOAL, json!({}), Auth::Bearer(&token)).await;

    assert_eq!(response.error_code(), "NOT_FOUND");
    assert_eq!(response.error_message(), "User not found");
}
