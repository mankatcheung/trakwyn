use std::sync::Arc;

use chrono::TimeDelta;

use crate::domain::notification::NotificationType;
use crate::domain::session::Session;
use crate::use_cases::clock::now;
use crate::use_cases::constants::session::TTL_MS;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::notifications::{CreateNotificationInput, CreateNotificationUseCase};
use crate::use_cases::ports::{
    CreateSessionData, DeviceLabeler, EmailService, IpLocationResolver, SessionRepository,
    UserRepository,
};

const NEW_SIGN_IN_TITLE: &str = "New sign-in detected";
/// `#security-activity` scrolls straight to the login-event list this alert
/// is about, instead of the top of a long settings page.
const NEW_SIGN_IN_URL: &str = "/settings/security#security-activity";

pub struct CreateSessionInput {
    pub user_id: String,
    pub user_agent: Option<String>,
    pub ip_address: Option<String>,
}

pub struct CreateSessionUseCase {
    pub session_repository: Arc<dyn SessionRepository>,
    pub user_repository: Arc<dyn UserRepository>,
    pub device_labeler: Arc<dyn DeviceLabeler>,
    pub ip_location_resolver: Arc<dyn IpLocationResolver>,
    pub email_service: Arc<dyn EmailService>,
    pub create_notification_use_case: CreateNotificationUseCase,
    pub generate_id: GenerateId,
}

impl CreateSessionUseCase {
    pub async fn execute(&self, input: CreateSessionInput) -> DomainResult<Session> {
        let device_label = self.device_labeler.describe(input.user_agent.as_deref());
        let location = self.ip_location_resolver.lookup(input.ip_address.as_deref()).await;
        let user_agent = input.user_agent.as_deref().filter(|user_agent| !user_agent.is_empty());

        // The known user agents are snapshotted *before* this session is
        // inserted: querying afterwards would always find this session's own
        // user agent, making every login look like a known device.
        let known_user_agents = match user_agent {
            Some(_) => {
                self.session_repository.find_distinct_user_agents_by_user_id(&input.user_id).await?
            }
            None => Vec::new(),
        };

        let session = self
            .session_repository
            .create(CreateSessionData {
                id: (self.generate_id)(),
                user_id: input.user_id.clone(),
                user_agent: input.user_agent.clone(),
                ip_address: input.ip_address.clone(),
                device_label: Some(device_label.clone()),
                location: location.clone(),
                expires_at: now() + TimeDelta::milliseconds(TTL_MS),
                current_refresh_token_id: (self.generate_id)(),
            })
            .await?;

        // Awaited so the alert completes before the response is sent: Cloud
        // Run throttles CPU once no request is in flight, so a detached task
        // can stall or be dropped before it finishes. Its failures are
        // swallowed, so session creation is never blocked by the alert path.
        let _ = self
            .detect_new_device_and_alert(
                &input.user_id,
                user_agent,
                &device_label,
                location.as_deref(),
                input.ip_address.as_deref(),
                &known_user_agents,
            )
            .await;

        Ok(session)
    }

    /// Alerts the user when this user agent has not been seen on their
    /// account before.
    async fn detect_new_device_and_alert(
        &self,
        user_id: &str,
        user_agent: Option<&str>,
        device_label: &str,
        location: Option<&str>,
        ip_address: Option<&str>,
        known_user_agents: &[String],
    ) -> DomainResult<()> {
        let Some(user_agent) = user_agent else { return Ok(()) };

        // The user's very first session (registration or first login) is not
        // worth an alert.
        if known_user_agents.is_empty() {
            return Ok(());
        }
        if known_user_agents.iter().any(|known| known == user_agent) {
            return Ok(());
        }

        let Some(user) = self.user_repository.find_by_id(user_id).await? else { return Ok(()) };
        if user.email.is_empty() {
            return Ok(());
        }

        // The in-app notification goes first, and the email is allowed to
        // fail on its own. They carry the same warning by two routes, and the
        // email is the fragile one: a third-party API, and a template that
        // refuses to build a link it cannot trust. Sending it first would let
        // any of that take the notification down with it, leaving a user with
        // a suspicious sign-in and no warning at all.
        self.create_notification_use_case
            .execute(CreateNotificationInput {
                user_id: user_id.to_string(),
                notification_type: NotificationType::SecurityAlert,
                title: NEW_SIGN_IN_TITLE.to_string(),
                body: match location {
                    Some(location) if !location.is_empty() => {
                        format!("{device_label} signed in from {location}")
                    }
                    _ => format!("{device_label} signed in"),
                },
                url: Some(NEW_SIGN_IN_URL.to_string()),
            })
            .await?;

        self.email_service
            .send_new_device_login_alert(&user.email, device_label, location, ip_address, now())
            .await
    }
}
