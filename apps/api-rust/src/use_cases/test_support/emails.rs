use std::sync::Mutex;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{DigestFrequency, EmailService, WeeklyDigestData};

/// One mail a [`FakeEmailService`] was asked to send.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SentEmail {
    FollowUpReminder {
        to: String,
        company: String,
        role: String,
        follow_up_at: DateTime<Utc>,
    },
    WeeklyDigest {
        to: String,
        data: WeeklyDigestData,
        frequency: DigestFrequency,
    },
    PasswordReset {
        to: String,
        reset_url: String,
    },
    EmailVerification {
        to: String,
        verify_url: String,
    },
    BackupEmailVerification {
        to: String,
        verify_url: String,
    },
    NewDeviceLoginAlert {
        to: String,
        device_label: String,
        location: Option<String>,
        ip_address: Option<String>,
        login_time: DateTime<Utc>,
    },
}

impl SentEmail {
    pub fn to(&self) -> &str {
        match self {
            Self::FollowUpReminder { to, .. }
            | Self::WeeklyDigest { to, .. }
            | Self::PasswordReset { to, .. }
            | Self::EmailVerification { to, .. }
            | Self::BackupEmailVerification { to, .. }
            | Self::NewDeviceLoginAlert { to, .. } => to,
        }
    }
}

/// Records every mail in memory instead of sending it. While told to fail,
/// every send is refused with an internal error and nothing is recorded.
#[derive(Default)]
pub struct FakeEmailService {
    sent: Mutex<Vec<SentEmail>>,
    failure: Mutex<Option<String>>,
}

impl FakeEmailService {
    /// A service whose every send fails with `message`.
    pub fn failing(message: &str) -> Self {
        let service = Self::default();
        service.fail_with(message);
        service
    }

    /// Makes every later send fail with `message`, as the provider being
    /// down would.
    pub fn fail_with(&self, message: &str) {
        *self.failure.lock().unwrap() = Some(message.to_string());
    }

    /// Lets sends through again.
    pub fn recover(&self) {
        *self.failure.lock().unwrap() = None;
    }

    /// Every mail sent so far, oldest first.
    pub fn sent(&self) -> Vec<SentEmail> {
        self.sent.lock().unwrap().clone()
    }

    fn record(&self, email: SentEmail) -> DomainResult<()> {
        if let Some(message) = self.failure.lock().unwrap().clone() {
            return Err(DomainError::internal(message));
        }
        self.sent.lock().unwrap().push(email);
        Ok(())
    }
}

#[async_trait]
impl EmailService for FakeEmailService {
    async fn send_follow_up_reminder(
        &self,
        to: &str,
        company: &str,
        role: &str,
        follow_up_at: DateTime<Utc>,
    ) -> DomainResult<()> {
        self.record(SentEmail::FollowUpReminder {
            to: to.to_string(),
            company: company.to_string(),
            role: role.to_string(),
            follow_up_at,
        })
    }

    async fn send_weekly_digest(
        &self,
        to: &str,
        data: &WeeklyDigestData,
        frequency: DigestFrequency,
    ) -> DomainResult<()> {
        self.record(SentEmail::WeeklyDigest { to: to.to_string(), data: data.clone(), frequency })
    }

    async fn send_password_reset(&self, to: &str, reset_url: &str) -> DomainResult<()> {
        self.record(SentEmail::PasswordReset {
            to: to.to_string(),
            reset_url: reset_url.to_string(),
        })
    }

    async fn send_email_verification(&self, to: &str, verify_url: &str) -> DomainResult<()> {
        self.record(SentEmail::EmailVerification {
            to: to.to_string(),
            verify_url: verify_url.to_string(),
        })
    }

    async fn send_backup_email_verification(&self, to: &str, verify_url: &str) -> DomainResult<()> {
        self.record(SentEmail::BackupEmailVerification {
            to: to.to_string(),
            verify_url: verify_url.to_string(),
        })
    }

    async fn send_new_device_login_alert(
        &self,
        to: &str,
        device_label: &str,
        location: Option<&str>,
        ip_address: Option<&str>,
        login_time: DateTime<Utc>,
    ) -> DomainResult<()> {
        self.record(SentEmail::NewDeviceLoginAlert {
            to: to.to_string(),
            device_label: device_label.to_string(),
            location: location.map(str::to_string),
            ip_address: ip_address.map(str::to_string),
            login_time,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::clock;
    use crate::use_cases::errors::ErrorCode;

    #[tokio::test]
    async fn records_every_mail_in_the_order_it_was_sent() {
        let emails = FakeEmailService::default();
        let now = clock::now();

        emails.send_follow_up_reminder("a@b.com", "Acme", "Engineer", now).await.unwrap();
        emails
            .send_weekly_digest("a@b.com", &WeeklyDigestData::default(), DigestFrequency::Daily)
            .await
            .unwrap();
        emails.send_password_reset("a@b.com", "https://x.test/reset").await.unwrap();
        emails.send_email_verification("a@b.com", "https://x.test/verify").await.unwrap();
        emails.send_backup_email_verification("c@d.com", "https://x.test/backup").await.unwrap();
        emails
            .send_new_device_login_alert("a@b.com", "Mac", Some("London"), None, now)
            .await
            .unwrap();

        assert_eq!(
            emails.sent(),
            vec![
                SentEmail::FollowUpReminder {
                    to: "a@b.com".to_string(),
                    company: "Acme".to_string(),
                    role: "Engineer".to_string(),
                    follow_up_at: now,
                },
                SentEmail::WeeklyDigest {
                    to: "a@b.com".to_string(),
                    data: WeeklyDigestData::default(),
                    frequency: DigestFrequency::Daily,
                },
                SentEmail::PasswordReset {
                    to: "a@b.com".to_string(),
                    reset_url: "https://x.test/reset".to_string(),
                },
                SentEmail::EmailVerification {
                    to: "a@b.com".to_string(),
                    verify_url: "https://x.test/verify".to_string(),
                },
                SentEmail::BackupEmailVerification {
                    to: "c@d.com".to_string(),
                    verify_url: "https://x.test/backup".to_string(),
                },
                SentEmail::NewDeviceLoginAlert {
                    to: "a@b.com".to_string(),
                    device_label: "Mac".to_string(),
                    location: Some("London".to_string()),
                    ip_address: None,
                    login_time: now,
                },
            ]
        );
        assert_eq!(emails.sent()[4].to(), "c@d.com");
    }

    #[tokio::test]
    async fn refuses_every_send_while_told_to_fail_and_records_nothing() {
        let emails = FakeEmailService::failing("Brevo API error 503");

        let err = emails.send_password_reset("a@b.com", "https://x.test/reset").await.unwrap_err();

        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(emails.sent().is_empty());

        emails.recover();
        emails.send_password_reset("a@b.com", "https://x.test/reset").await.unwrap();
        assert_eq!(emails.sent().len(), 1);
    }
}
