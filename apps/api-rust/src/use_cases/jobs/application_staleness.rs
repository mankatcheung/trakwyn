use chrono::{DateTime, TimeDelta, Utc};

use crate::domain::application::{Application, ApplicationStatus};

pub const LIKELY_GHOSTED_AFTER_DAYS: i64 = 14;

/// Anything last touched at or before this instant has been quiet for long
/// enough to count as ghosted.
pub fn likely_ghosted_cutoff(now: DateTime<Utc>) -> DateTime<Utc> {
    now - TimeDelta::days(LIKELY_GHOSTED_AFTER_DAYS)
}

pub fn is_likely_ghosted(application: &Application, now: DateTime<Utc>) -> bool {
    let awaiting_reply =
        matches!(application.status, ApplicationStatus::Applied | ApplicationStatus::Interviewing);
    if !awaiting_reply || application.applied_at.is_none() {
        return false;
    }

    let cutoff = likely_ghosted_cutoff(now);
    application.updated_at <= cutoff
        && application.reminder_sent_at.is_none_or(|sent_at| sent_at <= cutoff)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::test_support::application_owned_by;

    fn now() -> DateTime<Utc> {
        "2026-08-20T12:00:00Z".parse().unwrap()
    }

    fn stale() -> Application {
        let long_ago = likely_ghosted_cutoff(now());
        Application {
            status: ApplicationStatus::Applied,
            applied_at: Some(long_ago),
            updated_at: long_ago,
            ..application_owned_by("app-1", "user-1")
        }
    }

    #[test]
    fn an_application_untouched_for_the_whole_window_is_ghosted() {
        assert!(is_likely_ghosted(&stale(), now()));
    }

    #[test]
    fn one_touched_inside_the_window_is_not() {
        let recent = likely_ghosted_cutoff(now()) + TimeDelta::milliseconds(1);
        assert!(!is_likely_ghosted(&Application { updated_at: recent, ..stale() }, now()));
    }

    #[test]
    fn a_reminder_inside_the_window_keeps_it_from_counting() {
        let reminded = Application { reminder_sent_at: Some(now()), ..stale() };
        assert!(!is_likely_ghosted(&reminded, now()));

        let reminded_long_ago = Application { reminder_sent_at: stale().applied_at, ..stale() };
        assert!(is_likely_ghosted(&reminded_long_ago, now()));
    }

    #[test]
    fn only_applied_and_interviewing_applications_can_be_ghosted() {
        for status in ApplicationStatus::ALL {
            let expected =
                matches!(status, ApplicationStatus::Applied | ApplicationStatus::Interviewing);
            assert_eq!(is_likely_ghosted(&Application { status, ..stale() }, now()), expected);
        }
    }

    #[test]
    fn an_application_never_marked_applied_is_not_ghosted() {
        assert!(!is_likely_ghosted(&Application { applied_at: None, ..stale() }, now()));
    }
}
