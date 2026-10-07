use std::fmt;

use async_trait::async_trait;
use chrono::{DateTime, Utc};
use serde::Serialize;

use super::templates::{
    build_backup_email_verification_html, build_email_verification_html,
    build_new_device_login_alert_html, build_password_reset_html, build_weekly_digest_html,
};
use crate::use_cases::clock;
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{DigestFrequency, EmailService, WeeklyDigestData};

/// Brevo's transactional-email endpoint: what production passes as `api_url`.
pub const BREVO_API_URL: &str = "https://api.brevo.com/v3/smtp/email";

/// Longest `code` taken from a Brevo error body.
const MAX_ERROR_CODE_LENGTH: usize = 64;

/// Brevo refused a message.
///
/// Carries the status and Brevo's `code` only. The response body can echo
/// the request back, recipient included, and this error's text ends up in
/// the logs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrevoApiError {
    pub status: u16,
    pub code: Option<String>,
}

impl fmt::Display for BrevoApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Brevo API error {}", self.status)?;
        match &self.code {
            Some(code) => write!(f, " ({code})"),
            None => Ok(()),
        }
    }
}

impl std::error::Error for BrevoApiError {}

#[derive(Serialize)]
struct Sender<'a> {
    name: &'a str,
    email: &'a str,
}

#[derive(Serialize)]
struct Recipient<'a> {
    email: &'a str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Message<'a> {
    sender: Sender<'a>,
    to: [Recipient<'a>; 1],
    subject: &'a str,
    html_content: &'a str,
}

pub struct BrevoEmailService {
    client: reqwest::Client,
    api_url: String,
    api_key: String,
    from_email: String,
    from_name: String,
    web_app_origin: Option<String>,
}

impl BrevoEmailService {
    /// `api_url` is [`BREVO_API_URL`] outside tests. `web_app_origin` is
    /// where the new-device alert links to; without one that email is
    /// refused rather than sent with a guessed link.
    pub fn new(
        client: reqwest::Client,
        api_url: impl Into<String>,
        api_key: impl Into<String>,
        from_email: impl Into<String>,
        from_name: impl Into<String>,
        web_app_origin: Option<String>,
    ) -> Self {
        Self {
            client,
            api_url: api_url.into(),
            api_key: api_key.into(),
            from_email: from_email.into(),
            from_name: from_name.into(),
            web_app_origin,
        }
    }

    /// `send_weekly_digest` with the clock made explicit: the subject and the
    /// header name the day the digest is sent.
    async fn send_weekly_digest_at(
        &self,
        to: &str,
        data: &WeeklyDigestData,
        frequency: DigestFrequency,
        now: DateTime<Utc>,
    ) -> DomainResult<()> {
        let (period, title) = match frequency {
            DigestFrequency::Daily => ("Day", "Daily"),
            DigestFrequency::Weekly => ("Week", "Weekly"),
        };
        // "Week of June 1, 2024", in UTC: the zone `apps/api` runs in.
        let period_label = format!("{period} of {}", now.format("%B %-d, %Y"));
        let html_content = build_weekly_digest_html(data, &period_label, frequency);
        self.send(to, &format!("Your {title} Job Search Digest — {period_label}"), &html_content)
            .await
    }

    /// The one place a message goes to Brevo. The `trakwyn.email.sent`
    /// counter (by `template` and `outcome`) belongs here once metrics are
    /// ported: `failed` when the request gets no answer or a non-2xx one,
    /// `sent` otherwise.
    async fn send(&self, to: &str, subject: &str, html_content: &str) -> DomainResult<()> {
        let message = Message {
            sender: Sender { name: &self.from_name, email: &self.from_email },
            to: [Recipient { email: to }],
            subject,
            html_content,
        };

        let response = self
            .client
            .post(&self.api_url)
            .header("api-key", &self.api_key)
            .json(&message)
            .send()
            .await
            .map_err(DomainError::internal)?;

        let status = response.status();
        if !status.is_success() {
            let code = read_brevo_error_code(response).await;
            return Err(DomainError::internal(BrevoApiError { status: status.as_u16(), code }));
        }
        Ok(())
    }
}

/// Brevo's error `code` is a short machine token (`unauthorized`,
/// `invalid_parameter`); anything that does not look like one is dropped
/// rather than risk echoing the recipient back.
fn is_brevo_error_code(code: &str) -> bool {
    (1..=MAX_ERROR_CODE_LENGTH).contains(&code.len())
        && code.bytes().all(|byte| byte.is_ascii_lowercase() || byte == b'_')
}

async fn read_brevo_error_code(response: reqwest::Response) -> Option<String> {
    // Not JSON, or the body could not be read: the status alone still says
    // what happened.
    let body: serde_json::Value = serde_json::from_str(&response.text().await.ok()?).ok()?;
    let code = body.as_object()?.get("code")?.as_str()?;
    is_brevo_error_code(code).then(|| code.to_string())
}

#[async_trait]
impl EmailService for BrevoEmailService {
    async fn send_follow_up_reminder(
        &self,
        to: &str,
        company: &str,
        role: &str,
        follow_up_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        // "Saturday, June 15, 2024", in UTC.
        let date = follow_up_at.format("%A, %B %-d, %Y");
        self.send(
            to,
            &format!("Reminder: Follow up on {role} at {company}"),
            &format!(
                "<p>This is a reminder to follow up on your <strong>{role}</strong> application at <strong>{company}</strong>.</p><p>Your scheduled follow-up date is <strong>{date}</strong>.</p>"
            ),
        )
        .await
    }

    async fn send_weekly_digest(
        &self,
        to: &str,
        data: &WeeklyDigestData,
        frequency: DigestFrequency,
    ) -> DomainResult<()> {
        self.send_weekly_digest_at(to, data, frequency, clock::now()).await
    }

    async fn send_password_reset(&self, to: &str, reset_url: &str) -> DomainResult<()> {
        self.send(to, "Reset your Trakwyn password", &build_password_reset_html(reset_url)).await
    }

    async fn send_email_verification(&self, to: &str, verify_url: &str) -> DomainResult<()> {
        self.send(to, "Verify your Trakwyn email", &build_email_verification_html(verify_url)).await
    }

    async fn send_backup_email_verification(&self, to: &str, verify_url: &str) -> DomainResult<()> {
        self.send(
            to,
            "Verify your backup email for Trakwyn",
            &build_backup_email_verification_html(verify_url),
        )
        .await
    }

    async fn send_new_device_login_alert(
        &self,
        to: &str,
        device_label: &str,
        location: Option<&str>,
        ip_address: Option<&str>,
        login_time: DateTime<Utc>,
    ) -> DomainResult<()> {
        let html_content = build_new_device_login_alert_html(
            self.web_app_origin.as_deref(),
            device_label,
            location,
            ip_address,
            login_time,
        )
        .map_err(DomainError::internal)?;
        self.send(to, "New device signed in to your Trakwyn account", &html_content).await
    }
}

#[cfg(test)]
mod tests {
    use std::error::Error;

    use serde_json::json;

    use super::*;
    use crate::infrastructure::net::stub_server::{unreachable_base_url, StubServer};
    use crate::use_cases::errors::ErrorCode;
    use crate::use_cases::ports::email_service::DigestApplication;

    const RECIPIENT: &str = "person@example.com";

    fn service(api_url: &str) -> BrevoEmailService {
        BrevoEmailService::new(
            reqwest::Client::new(),
            api_url,
            "test-api-key",
            "noreply@trakwyn.com",
            "Trakwyn",
            Some("https://app.example.com".to_string()),
        )
    }

    fn at(iso: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(iso).unwrap().with_timezone(&Utc)
    }

    /// The text of the infrastructure failure a send was refused with.
    fn failure(result: DomainResult<()>) -> String {
        let err = result.unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
        err.source().unwrap().to_string()
    }

    fn digest() -> WeeklyDigestData {
        WeeklyDigestData {
            total_applications: 5,
            by_status: vec![("applied".to_string(), 5)],
            new_this_week: vec![DigestApplication {
                company: "Acme Corp".to_string(),
                role: "Software Engineer".to_string(),
            }],
            ..WeeklyDigestData::default()
        }
    }

    #[test]
    fn the_production_endpoint_is_brevos() {
        assert_eq!(BREVO_API_URL, "https://api.brevo.com/v3/smtp/email");
    }

    #[tokio::test]
    async fn posts_json_to_the_api_url_with_the_api_key_header() {
        let server = StubServer::answering(200, "").await;
        let url = format!("{}/v3/smtp/email", server.base_url);

        service(&url)
            .send_follow_up_reminder(
                "user@example.com",
                "Acme Corp",
                "Software Engineer",
                at("2024-06-15T00:00:00.000Z"),
            )
            .await
            .unwrap();

        let request = server.single_request();
        assert_eq!(request.method, "POST");
        assert_eq!(request.path, "/v3/smtp/email");
        assert_eq!(request.header("api-key"), Some("test-api-key"));
        assert_eq!(request.header("content-type"), Some("application/json"));
    }

    #[tokio::test]
    async fn a_follow_up_reminder_carries_the_sender_recipient_subject_and_formatted_date() {
        let server = StubServer::answering(200, "").await;

        service(&server.base_url)
            .send_follow_up_reminder(
                "user@example.com",
                "Acme Corp",
                "Software Engineer",
                at("2024-06-15T00:00:00.000Z"),
            )
            .await
            .unwrap();

        assert_eq!(
            server.single_request().json(),
            json!({
                "sender": { "name": "Trakwyn", "email": "noreply@trakwyn.com" },
                "to": [{ "email": "user@example.com" }],
                "subject": "Reminder: Follow up on Software Engineer at Acme Corp",
                "htmlContent": "<p>This is a reminder to follow up on your <strong>Software Engineer</strong> application at <strong>Acme Corp</strong>.</p><p>Your scheduled follow-up date is <strong>Saturday, June 15, 2024</strong>.</p>",
            })
        );
    }

    #[tokio::test]
    async fn uses_the_configured_sender() {
        let server = StubServer::answering(200, "").await;
        let service = BrevoEmailService::new(
            reqwest::Client::new(),
            &server.base_url,
            "test-api-key",
            "hello@custom.com",
            "Custom Sender",
            None,
        );

        service.send_password_reset(RECIPIENT, "https://x.test/reset").await.unwrap();

        assert_eq!(
            server.single_request().json()["sender"],
            json!({ "name": "Custom Sender", "email": "hello@custom.com" })
        );
    }

    #[tokio::test]
    async fn a_digest_builds_its_subject_from_the_day_it_is_sent_and_posts_the_rendered_template() {
        let server = StubServer::answering(200, "").await;
        let data = digest();

        service(&server.base_url)
            .send_weekly_digest_at(
                "user@example.com",
                &data,
                DigestFrequency::Weekly,
                at("2024-06-01T00:00:00.000Z"),
            )
            .await
            .unwrap();

        let body = server.single_request().json();
        let week_label = "Week of June 1, 2024";
        assert_eq!(body["to"], json!([{ "email": "user@example.com" }]));
        assert_eq!(body["subject"], format!("Your Weekly Job Search Digest — {week_label}"));
        assert_eq!(
            body["htmlContent"],
            build_weekly_digest_html(&data, week_label, DigestFrequency::Weekly)
        );
    }

    #[tokio::test]
    async fn a_daily_digest_is_labelled_by_the_day() {
        let server = StubServer::answering(200, "").await;
        let data = digest();

        service(&server.base_url)
            .send_weekly_digest_at(
                "user@example.com",
                &data,
                DigestFrequency::Daily,
                at("2024-12-25T23:59:59.000Z"),
            )
            .await
            .unwrap();

        let body = server.single_request().json();
        let day_label = "Day of December 25, 2024";
        assert_eq!(body["subject"], format!("Your Daily Job Search Digest — {day_label}"));
        assert_eq!(
            body["htmlContent"],
            build_weekly_digest_html(&data, day_label, DigestFrequency::Daily)
        );
    }

    #[tokio::test]
    async fn the_port_method_sends_a_digest_for_today() {
        let server = StubServer::answering(200, "").await;

        service(&server.base_url)
            .send_weekly_digest("user@example.com", &digest(), DigestFrequency::Weekly)
            .await
            .unwrap();

        let subject = server.single_request().json()["subject"].as_str().unwrap().to_string();
        assert!(subject.starts_with("Your Weekly Job Search Digest — Week of "), "{subject}");
    }

    #[tokio::test]
    async fn a_password_reset_posts_a_subject_and_html_built_from_the_reset_url() {
        let server = StubServer::answering(200, "").await;
        let reset_url = "https://app.jobfinder.com/reset-password?token=abc123";

        service(&server.base_url).send_password_reset("user@example.com", reset_url).await.unwrap();

        let body = server.single_request().json();
        assert_eq!(body["to"], json!([{ "email": "user@example.com" }]));
        assert_eq!(body["subject"], "Reset your Trakwyn password");
        assert_eq!(body["htmlContent"], build_password_reset_html(reset_url));
    }

    #[tokio::test]
    async fn an_email_verification_posts_a_subject_and_html_built_from_the_verify_url() {
        let server = StubServer::answering(200, "").await;
        let verify_url = "https://app.jobfinder.com/verify-email?token=abc123";

        service(&server.base_url)
            .send_email_verification("user@example.com", verify_url)
            .await
            .unwrap();

        let body = server.single_request().json();
        assert_eq!(body["to"], json!([{ "email": "user@example.com" }]));
        assert_eq!(body["subject"], "Verify your Trakwyn email");
        assert_eq!(body["htmlContent"], build_email_verification_html(verify_url));
    }

    #[tokio::test]
    async fn a_backup_email_verification_posts_its_own_subject_and_template() {
        let server = StubServer::answering(200, "").await;
        let verify_url = "https://x.test/verify";

        service(&server.base_url)
            .send_backup_email_verification(RECIPIENT, verify_url)
            .await
            .unwrap();

        let body = server.single_request().json();
        assert_eq!(body["subject"], "Verify your backup email for Trakwyn");
        assert_eq!(body["htmlContent"], build_backup_email_verification_html(verify_url));
    }

    #[tokio::test]
    async fn a_new_device_alert_posts_its_subject_and_links_to_the_configured_origin() {
        let server = StubServer::answering(201, "").await;
        let login_time = at("2026-08-20T09:00:00.000Z");

        service(&server.base_url)
            .send_new_device_login_alert(
                RECIPIENT,
                "Chrome on macOS",
                Some("London, GB"),
                Some("203.0.113.4"),
                login_time,
            )
            .await
            .unwrap();

        let body = server.single_request().json();
        assert_eq!(body["subject"], "New device signed in to your Trakwyn account");
        assert_eq!(
            body["htmlContent"],
            build_new_device_login_alert_html(
                Some("https://app.example.com"),
                "Chrome on macOS",
                Some("London, GB"),
                Some("203.0.113.4"),
                login_time,
            )
            .unwrap()
        );
    }

    #[tokio::test]
    async fn a_new_device_alert_is_refused_without_an_origin_and_nothing_is_sent() {
        let server = StubServer::answering(200, "").await;
        let service = BrevoEmailService::new(
            reqwest::Client::new(),
            &server.base_url,
            "test-api-key",
            "noreply@trakwyn.com",
            "Trakwyn",
            None,
        );

        let result = service
            .send_new_device_login_alert(RECIPIENT, "Chrome on macOS", None, None, clock::now())
            .await;

        assert!(failure(result).starts_with("WEB_APP_ORIGIN is not set"));
        assert!(server.requests().is_empty());
    }

    #[tokio::test]
    async fn fails_with_the_status_when_brevo_refuses_any_template() {
        let server = StubServer::answering(503, "unavailable").await;
        let service = service(&server.base_url);
        let now = clock::now();

        let results = [
            service.send_follow_up_reminder(RECIPIENT, "Acme", "Engineer", now).await,
            service
                .send_weekly_digest(
                    RECIPIENT,
                    &WeeklyDigestData::default(),
                    DigestFrequency::Weekly,
                )
                .await,
            service.send_password_reset(RECIPIENT, "https://x.test/reset").await,
            service.send_email_verification(RECIPIENT, "https://x.test/verify").await,
            service.send_backup_email_verification(RECIPIENT, "https://x.test/verify").await,
            service
                .send_new_device_login_alert(RECIPIENT, "Chrome on macOS", None, None, now)
                .await,
        ];

        for result in results {
            assert_eq!(failure(result), "Brevo API error 503");
        }
        assert_eq!(server.requests().len(), 6);
    }

    #[tokio::test]
    async fn any_2xx_answer_is_a_sent_message() {
        let server = StubServer::answering(201, r#"{"messageId":"<1@brevo>"}"#).await;

        service(&server.base_url)
            .send_password_reset(RECIPIENT, "https://x.test/reset")
            .await
            .unwrap();
    }

    #[tokio::test]
    async fn a_request_that_never_got_a_response_is_an_internal_failure() {
        let service = service(&unreachable_base_url().await);

        let err = service.send_password_reset(RECIPIENT, "https://x.test/reset").await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(err.source().unwrap().downcast_ref::<reqwest::Error>().is_some());
    }

    #[tokio::test]
    async fn reports_brevos_error_code_but_never_its_body_or_the_recipient() {
        let body = json!({
            "code": "invalid_parameter",
            "message": format!("email {RECIPIENT} is not valid"),
        });
        let server = StubServer::answering(400, body.to_string()).await;

        let result =
            service(&server.base_url).send_password_reset(RECIPIENT, "https://x.test/reset").await;

        assert_eq!(failure(result), "Brevo API error 400 (invalid_parameter)");
    }

    #[tokio::test]
    async fn reports_the_status_alone_when_the_body_has_no_usable_code() {
        let bodies = [
            ("not JSON", "Service Unavailable".to_string()),
            ("JSON without a code", json!({ "message": "down" }).to_string()),
            (
                "a code that is not a token",
                json!({ "code": format!("bad {RECIPIENT}") }).to_string(),
            ),
            ("a code that is not a string", json!({ "code": 42 }).to_string()),
            ("JSON that is not an object", json!(["unauthorized"]).to_string()),
            ("an empty body", String::new()),
        ];

        for (label, body) in bodies {
            let server = StubServer::answering(503, body).await;

            let result = service(&server.base_url)
                .send_password_reset(RECIPIENT, "https://x.test/reset")
                .await;

            assert_eq!(failure(result), "Brevo API error 503", "{label}");
        }
    }

    #[test]
    fn an_error_code_is_a_short_lowercase_token() {
        assert!(is_brevo_error_code("unauthorized"));
        assert!(is_brevo_error_code("invalid_parameter"));
        assert!(is_brevo_error_code(&"a".repeat(64)));

        assert!(!is_brevo_error_code(""));
        assert!(!is_brevo_error_code(&"a".repeat(65)));
        assert!(!is_brevo_error_code("Unauthorized"));
        assert!(!is_brevo_error_code("bad person@example.com"));
        assert!(!is_brevo_error_code("code1"));
        assert!(!is_brevo_error_code("code\n"));
    }
}
