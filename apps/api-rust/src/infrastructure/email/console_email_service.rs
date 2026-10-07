use async_trait::async_trait;
use chrono::{DateTime, SecondsFormat, Utc};

use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::{DigestFrequency, EmailService, WeeklyDigestData};

type Sink = Box<dyn Fn(&str) + Send + Sync>;

/// Logs instead of calling Brevo: for local dev without a `BREVO_API_KEY`
/// and for CI, where the alternative was every flow that sends mail (email
/// change, backup email, password reset, new-device alerts, digests)
/// failing when it hit Brevo with an empty API key.
///
/// Each line carries the recipient and the confirm/reset URL on purpose, so
/// a developer can complete the flow. That is why it writes to stdout as
/// `apps/api` does rather than through the structured logger, and why it
/// must never be the provider in production.
pub struct ConsoleEmailService {
    sink: Sink,
}

impl Default for ConsoleEmailService {
    fn default() -> Self {
        Self::new()
    }
}

impl ConsoleEmailService {
    /// Writes each line to stdout.
    pub fn new() -> Self {
        Self::with_sink(|line| println!("{line}"))
    }

    /// Hands each line to `sink` instead of stdout.
    pub fn with_sink(sink: impl Fn(&str) + Send + Sync + 'static) -> Self {
        Self { sink: Box::new(sink) }
    }

    fn log(&self, line: String) {
        (self.sink)(&line);
    }
}

/// `2024-06-15T00:00:00.000Z`, as JavaScript's `toISOString` writes it.
fn iso(time: DateTime<Utc>) -> String {
    time.to_rfc3339_opts(SecondsFormat::Millis, true)
}

#[async_trait]
impl EmailService for ConsoleEmailService {
    async fn send_follow_up_reminder(
        &self,
        to: &str,
        company: &str,
        role: &str,
        follow_up_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        self.log(format!(
            "[email:console] follow-up reminder to {to}: {role} at {company}, {}",
            iso(follow_up_at)
        ));
        Ok(())
    }

    async fn send_weekly_digest(
        &self,
        to: &str,
        _data: &WeeklyDigestData,
        frequency: DigestFrequency,
    ) -> DomainResult<()> {
        self.log(format!("[email:console] {} digest to {to}", frequency.as_str()));
        Ok(())
    }

    async fn send_password_reset(&self, to: &str, reset_url: &str) -> DomainResult<()> {
        self.log(format!("[email:console] password reset to {to}: {reset_url}"));
        Ok(())
    }

    async fn send_email_verification(&self, to: &str, verify_url: &str) -> DomainResult<()> {
        self.log(format!("[email:console] email verification to {to}: {verify_url}"));
        Ok(())
    }

    async fn send_backup_email_verification(&self, to: &str, verify_url: &str) -> DomainResult<()> {
        self.log(format!("[email:console] backup email verification to {to}: {verify_url}"));
        Ok(())
    }

    async fn send_new_device_login_alert(
        &self,
        to: &str,
        device_label: &str,
        location: Option<&str>,
        ip_address: Option<&str>,
        login_time: DateTime<Utc>,
    ) -> DomainResult<()> {
        self.log(format!(
            "[email:console] new device login alert to {to}: {device_label} · {} · {} · {}",
            location.unwrap_or("unknown location"),
            ip_address.unwrap_or("unknown IP"),
            iso(login_time)
        ));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use super::*;

    fn recording() -> (ConsoleEmailService, Arc<Mutex<Vec<String>>>) {
        let lines = Arc::new(Mutex::new(Vec::new()));
        let sink = lines.clone();
        let service =
            ConsoleEmailService::with_sink(move |line| sink.lock().unwrap().push(line.to_string()));
        (service, lines)
    }

    fn day() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2024-06-15T00:00:00.000Z").unwrap().with_timezone(&Utc)
    }

    #[tokio::test]
    async fn logs_one_line_for_every_port_method() {
        let (service, lines) = recording();

        service.send_follow_up_reminder("a@b.com", "Acme", "Engineer", day()).await.unwrap();
        service
            .send_weekly_digest("a@b.com", &WeeklyDigestData::default(), DigestFrequency::Weekly)
            .await
            .unwrap();
        service.send_password_reset("a@b.com", "https://example.com/reset").await.unwrap();
        service.send_email_verification("a@b.com", "https://example.com/verify").await.unwrap();
        service
            .send_backup_email_verification("a@b.com", "https://example.com/verify-backup")
            .await
            .unwrap();
        service
            .send_new_device_login_alert(
                "a@b.com",
                "Chrome on macOS",
                Some("San Francisco, CA"),
                Some("1.2.3.4"),
                day(),
            )
            .await
            .unwrap();

        assert_eq!(
            *lines.lock().unwrap(),
            vec![
                "[email:console] follow-up reminder to a@b.com: Engineer at Acme, 2024-06-15T00:00:00.000Z",
                "[email:console] weekly digest to a@b.com",
                "[email:console] password reset to a@b.com: https://example.com/reset",
                "[email:console] email verification to a@b.com: https://example.com/verify",
                "[email:console] backup email verification to a@b.com: https://example.com/verify-backup",
                "[email:console] new device login alert to a@b.com: Chrome on macOS · San Francisco, CA · 1.2.3.4 · 2024-06-15T00:00:00.000Z",
            ]
        );
    }

    #[tokio::test]
    async fn includes_the_confirmation_url_so_a_developer_without_a_brevo_key_can_complete_the_flow(
    ) {
        let (service, lines) = recording();

        service
            .send_email_verification("a@b.com", "https://example.com/verify?token=abc")
            .await
            .unwrap();

        assert!(lines.lock().unwrap()[0].contains("https://example.com/verify?token=abc"));
    }

    #[tokio::test]
    async fn names_what_is_unknown_about_a_new_device_and_the_digest_frequency() {
        let (service, lines) = recording();

        service.send_new_device_login_alert("a@b.com", "Mac", None, None, day()).await.unwrap();
        service
            .send_weekly_digest("a@b.com", &WeeklyDigestData::default(), DigestFrequency::Daily)
            .await
            .unwrap();

        let lines = lines.lock().unwrap();
        assert!(lines[0].contains("Mac · unknown location · unknown IP · "));
        assert_eq!(lines[1], "[email:console] daily digest to a@b.com");
    }
}
