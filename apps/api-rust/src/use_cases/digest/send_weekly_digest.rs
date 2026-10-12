use std::sync::Arc;

use chrono::TimeDelta;

use crate::domain::application::{Application, ApplicationStatus};
use crate::domain::user::{DigestFrequency, User};
use crate::use_cases::clock::now;
use crate::use_cases::constants::{digest_window_ms, durations_ms};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::email_service::{DigestApplication, DigestFollowUp};
use crate::use_cases::ports::{
    ApplicationRepository, DigestFrequency as EmailDigestFrequency, EmailService,
    FindApplicationsFilters, UserRepository, WeeklyDigestData,
};
use crate::use_cases::user::weekly_application_goal::weekly_application_goal_stats;

/// What one run did.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DigestSummary {
    pub total_users: usize,
    pub sent: usize,
    pub skipped: usize,
    /// Users whose digest failed. The rest of the run carries on past them;
    /// counting them is what stops a partial run reporting as a clean one in
    /// the route's summary line.
    pub failed: usize,
}

/// What became of one user.
enum Outcome {
    Sent,
    Skipped,
}

pub struct SendWeeklyDigestUseCase {
    pub user_repository: Arc<dyn UserRepository>,
    pub application_repository: Arc<dyn ApplicationRepository>,
    pub email_service: Arc<dyn EmailService>,
}

/// Statuses whose follow-ups are no longer overdue: the application is over.
const CLOSED_STATUSES: [ApplicationStatus; 3] =
    [ApplicationStatus::Rejected, ApplicationStatus::Accepted, ApplicationStatus::Withdrawn];

impl SendWeeklyDigestUseCase {
    pub async fn execute(&self) -> DomainResult<DigestSummary> {
        let users = self.user_repository.find_all().await?;

        // Every user is handled concurrently and independently, as
        // `Promise.allSettled` does: a failure is counted, never propagated.
        let results =
            futures::future::join_all(users.iter().map(|user| self.digest_for(user))).await;

        let mut summary =
            DigestSummary { total_users: users.len(), sent: 0, skipped: 0, failed: 0 };
        for result in results {
            match result {
                Ok(Outcome::Sent) => summary.sent += 1,
                Ok(Outcome::Skipped) => summary.skipped += 1,
                Err(_) => summary.failed += 1,
            }
        }
        Ok(summary)
    }

    async fn digest_for(&self, user: &User) -> DomainResult<Outcome> {
        let frequency = user.digest_frequency;
        if frequency == DigestFrequency::Off
            || (!user.weekly_digest_enabled && frequency == DigestFrequency::Weekly)
        {
            return Ok(Outcome::Skipped);
        }

        let now = now();
        let daily = frequency == DigestFrequency::Daily;

        let resend_after = if daily {
            digest_window_ms::DAILY_RESEND_AFTER
        } else {
            digest_window_ms::RESEND_AFTER
        };
        if user
            .last_digest_sent_at
            .is_some_and(|sent_at| sent_at > now - TimeDelta::milliseconds(resend_after))
        {
            return Ok(Outcome::Skipped);
        }

        let apps = self
            .application_repository
            .find_all_by_user_id(&user.id, FindApplicationsFilters::default())
            .await?;
        if apps.is_empty() {
            return Ok(Outcome::Skipped);
        }

        let data = digest_data(user, &apps, now, daily);

        // Weekly is the email service's default frequency.
        let email_frequency =
            if daily { EmailDigestFrequency::Daily } else { EmailDigestFrequency::Weekly };
        self.email_service.send_weekly_digest(&user.email, &data, email_frequency).await?;
        self.user_repository.update_last_digest_sent_at(&user.id, now).await?;
        Ok(Outcome::Sent)
    }
}

fn digest_data(
    user: &User,
    apps: &[Application],
    now: chrono::DateTime<chrono::Utc>,
    daily: bool,
) -> WeeklyDigestData {
    let period =
        TimeDelta::milliseconds(if daily { digest_window_ms::DAY } else { durations_ms::WEEK });
    let period_ago = now - period;
    let next_period = now + period;

    // Status → count in order of first appearance, as an object's keys are.
    let mut by_status: Vec<(String, i64)> = Vec::new();
    for app in apps {
        let status = app.status.as_str();
        match by_status.iter_mut().find(|(name, _)| name == status) {
            Some((_, count)) => *count += 1,
            None => by_status.push((status.to_string(), 1)),
        }
    }

    let new_this_week = apps
        .iter()
        .filter(|app| app.created_at >= period_ago)
        .map(|app| DigestApplication { company: app.company.clone(), role: app.role.clone() })
        .collect();

    let follow_up = |app: &Application, at| DigestFollowUp {
        company: app.company.clone(),
        role: app.role.clone(),
        follow_up_at: at,
    };

    let overdue_follow_ups = apps
        .iter()
        .filter_map(|app| {
            let at = app.follow_up_at?;
            (at < now && !CLOSED_STATUSES.contains(&app.status)).then(|| follow_up(app, at))
        })
        .collect();

    let upcoming_follow_ups = apps
        .iter()
        .filter_map(|app| {
            let at = app.follow_up_at?;
            (at >= now && at <= next_period).then(|| follow_up(app, at))
        })
        .collect();

    let goal = weekly_application_goal_stats(apps, user.weekly_application_goal, now);

    WeeklyDigestData {
        total_applications: apps.len() as i64,
        by_status,
        new_this_week,
        overdue_follow_ups,
        upcoming_follow_ups,
        weekly_application_goal: Some(i64::from(user.weekly_application_goal)),
        current_week_application_count: Some(i64::from(goal.current_week_count)),
        application_streak_weeks: Some(i64::from(goal.streak_weeks)),
    }
}
