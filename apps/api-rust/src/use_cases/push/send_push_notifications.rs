use std::sync::Arc;

use crate::domain::notification::NotificationType;
use crate::domain::push_subscription::PushSubscriptionProvider;
use crate::use_cases::clock::now;
use crate::use_cases::constants::reminder_window_ms;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::notifications::{CreateNotificationInput, CreateNotificationUseCase};
use crate::use_cases::ports::logger::Logger;
use crate::use_cases::ports::web_push_service::{PushPayload, PushSubscriptionKeys};
use crate::use_cases::ports::{
    ApplicationRepository, ExpoPushService, InterviewRoundRepository, PushSubscriptionRepository,
    UserRepository, WebPushService,
};

/// What one run did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PushNotificationsSummary {
    /// Individual pushes accepted by web-push or Expo, counted per subscription.
    pub delivered: usize,
    /// Pushes that failed; the run continued past each one.
    pub failed: usize,
}

struct NotificationPayload {
    user_id: String,
    notification_type: NotificationType,
    title: String,
    body: String,
    url: String,
}

pub struct SendPushNotificationsUseCase {
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub interview_round_repository: Arc<dyn InterviewRoundRepository>,
    pub user_repository: Arc<dyn UserRepository>,
    pub push_subscription_repository: Arc<dyn PushSubscriptionRepository>,
    pub logger: Arc<dyn Logger>,
    pub web_push_service: Arc<dyn WebPushService>,
    pub expo_push_service: Arc<dyn ExpoPushService>,
    pub create_notification_use_case: CreateNotificationUseCase,
}

/// Notifications grouped by user in first-seen order, as a JavaScript `Map`
/// iterates them.
#[derive(Default)]
struct NotificationsByUser(Vec<(String, Vec<NotificationPayload>)>);

impl NotificationsByUser {
    fn push(&mut self, notification: NotificationPayload) {
        match self.0.iter_mut().find(|(user_id, _)| *user_id == notification.user_id) {
            Some((_, existing)) => existing.push(notification),
            None => self.0.push((notification.user_id.clone(), vec![notification])),
        }
    }
}

impl SendPushNotificationsUseCase {
    pub async fn execute(&self) -> DomainResult<PushNotificationsSummary> {
        let mut by_user = NotificationsByUser::default();
        let mut notified_round_ids: Vec<String> = Vec::new();

        // Upcoming interviews (within 24h, not completed or already notified).
        let upcoming_interviews = self
            .interview_round_repository
            .find_upcoming_within_window(reminder_window_ms::DUE_WITHIN)
            .await?;

        let started_at = now();

        for round in upcoming_interviews {
            let Some(scheduled_at) = round.scheduled_at else { continue };
            let Some(app) = self.application_repository.find_by_id(&round.application_id).await?
            else {
                continue;
            };

            // `toLocaleTimeString` with `{ hour: 'numeric', minute: '2-digit' }`
            // in the en-US locale and UTC: "3:30 PM".
            let time = scheduled_at.format("%-I:%M %p");

            by_user.push(NotificationPayload {
                user_id: app.user_id.clone(),
                notification_type: NotificationType::InterviewReminder,
                title: format!("Upcoming interview: {}", app.company),
                body: format!(
                    "{} \u{2014} {} interview tomorrow at {time}",
                    app.role,
                    round.r#type.as_str()
                ),
                // Deep-links straight to the Interviews section rather than
                // the default Notes tab.
                url: format!("/applications/{}?section=interviews", app.id),
            });
            notified_round_ids.push(round.id);
        }

        // Follow-up reminders (due now, deduplicated by reminderSentAt).
        for app in self.application_repository.find_due_for_reminder().await? {
            by_user.push(NotificationPayload {
                user_id: app.user_id.clone(),
                notification_type: NotificationType::FollowUpReminder,
                title: format!("Follow up: {}", app.company),
                body: format!("Time to follow up on your {} application", app.role),
                // Contacts, not the default Notes tab.
                url: format!("/applications/{}?section=contacts", app.id),
            });
        }

        // Persist every notification to the inbox regardless of push-delivery
        // outcome: a disabled/unsubscribed user should still see it later.
        for (_, notifications) in &by_user.0 {
            for notification in notifications {
                self.create_notification_use_case
                    .execute(CreateNotificationInput {
                        user_id: notification.user_id.clone(),
                        notification_type: notification.notification_type,
                        title: notification.title.clone(),
                        body: notification.body.clone(),
                        url: Some(notification.url.clone()),
                    })
                    .await?;
            }
        }

        let mut delivered = 0;
        let mut failed = 0;
        for (user_id, notifications) in &by_user.0 {
            let Some(user) = self.user_repository.find_by_id(user_id).await? else { continue };
            if !user.push_notifications_enabled {
                continue;
            }

            let subscriptions = self.push_subscription_repository.find_by_user_id(user_id).await?;
            if subscriptions.is_empty() {
                continue;
            }

            for notification in notifications {
                let payload = PushPayload {
                    title: notification.title.clone(),
                    body: notification.body.clone(),
                    url: notification.url.clone(),
                };
                for subscription in &subscriptions {
                    let outcome = match subscription.provider {
                        PushSubscriptionProvider::Expo => {
                            self.expo_push_service.send(&subscription.endpoint, &payload).await
                        }
                        PushSubscriptionProvider::Web => {
                            let keys = PushSubscriptionKeys {
                                endpoint: subscription.endpoint.clone(),
                                p256dh: subscription.p256dh.clone().unwrap_or_default(),
                                auth: subscription.auth.clone().unwrap_or_default(),
                            };
                            self.web_push_service.send(&keys, &payload).await
                        }
                    };
                    match outcome {
                        Ok(()) => delivered += 1,
                        Err(err) => {
                            failed += 1;
                            self.logger.error("Failed to send push notification", Some(&err), &[]);
                            // A web-push 410 or an Expo `DeviceNotRegistered`
                            // ticket: nothing will ever be delivered to this
                            // endpoint again.
                            if err.is_subscription_gone() {
                                self.push_subscription_repository
                                    .delete_by_endpoint(&subscription.endpoint)
                                    .await?;
                            }
                        }
                    }
                }
            }
        }

        // Mark interview rounds as notified so the next run does not re-send
        // them. Best-effort: one failure must not block the batch.
        for round_id in notified_round_ids {
            let _ = self
                .interview_round_repository
                .update_push_notification_sent_at(&round_id, started_at)
                .await;
        }

        Ok(PushNotificationsSummary { delivered, failed })
    }
}
