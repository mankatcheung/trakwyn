use std::collections::HashMap;

use chrono::{DateTime, Datelike, TimeDelta, Utc};

use crate::domain::application::Application;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WeeklyApplicationGoalStats {
    pub weekly_application_goal: i32,
    pub current_week_count: i32,
    pub current_week_start: DateTime<Utc>,
    pub streak_weeks: i32,
}

/// Midnight UTC on the Monday of the week `date` falls in.
pub fn week_start(date: DateTime<Utc>) -> DateTime<Utc> {
    let days_since_monday = i64::from(date.weekday().num_days_from_monday());
    let monday = date.date_naive() - TimeDelta::days(days_since_monday);
    monday.and_time(chrono::NaiveTime::MIN).and_utc()
}

/// Applications created this week against the goal, and how many completed
/// weeks in a row met it.
pub fn weekly_application_goal_stats(
    applications: &[Application],
    goal: i32,
    now: DateTime<Utc>,
) -> WeeklyApplicationGoalStats {
    let current_week_start = week_start(now);
    let mut counts: HashMap<DateTime<Utc>, i32> = HashMap::new();
    for application in applications {
        *counts.entry(week_start(application.created_at)).or_insert(0) += 1;
    }
    let count_in = |week: DateTime<Utc>| counts.get(&week).copied().unwrap_or(0);

    let current_week_count = count_in(current_week_start);
    let mut streak_weeks = 0;
    let mut week = current_week_start;

    // An unfinished current week does not break the completed-week streak.
    if current_week_count < goal {
        week -= TimeDelta::weeks(1);
    }
    while count_in(week) >= goal {
        streak_weeks += 1;
        week -= TimeDelta::weeks(1);
    }

    WeeklyApplicationGoalStats {
        weekly_application_goal: goal,
        current_week_count,
        current_week_start,
        streak_weeks,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::use_cases::test_support::application_owned_by;

    fn at(timestamp: &str) -> DateTime<Utc> {
        timestamp.parse().unwrap()
    }

    fn created(timestamp: &str) -> Application {
        Application { created_at: at(timestamp), ..application_owned_by("app", "user") }
    }

    #[test]
    fn a_week_starts_on_monday_at_midnight_utc() {
        // 2026-08-20 is a Thursday.
        assert_eq!(week_start(at("2026-08-20T15:30:00Z")), at("2026-08-17T00:00:00Z"));
        assert_eq!(week_start(at("2026-08-17T00:00:00Z")), at("2026-08-17T00:00:00Z"));
        // A Sunday belongs to the week that began six days earlier.
        assert_eq!(week_start(at("2026-08-23T23:59:59.999Z")), at("2026-08-17T00:00:00Z"));
    }

    #[test]
    fn counts_this_weeks_applications_against_the_goal() {
        let applications = [
            created("2026-08-17T00:00:00Z"),
            created("2026-08-19T10:00:00Z"),
            created("2026-08-16T23:59:59Z"),
        ];

        let stats = weekly_application_goal_stats(&applications, 5, at("2026-08-20T12:00:00Z"));

        assert_eq!(stats.weekly_application_goal, 5);
        assert_eq!(stats.current_week_count, 2);
        assert_eq!(stats.current_week_start, at("2026-08-17T00:00:00Z"));
        assert_eq!(stats.streak_weeks, 0);
    }

    #[test]
    fn an_unfinished_current_week_does_not_break_the_streak() {
        let applications = [
            created("2026-08-18T10:00:00Z"),
            created("2026-08-10T10:00:00Z"),
            created("2026-08-11T10:00:00Z"),
            created("2026-08-04T10:00:00Z"),
            created("2026-08-05T10:00:00Z"),
        ];

        let stats = weekly_application_goal_stats(&applications, 2, at("2026-08-20T12:00:00Z"));

        assert_eq!(stats.current_week_count, 1);
        assert_eq!(stats.streak_weeks, 2);
    }

    #[test]
    fn a_met_current_week_extends_the_streak() {
        let applications = [
            created("2026-08-18T10:00:00Z"),
            created("2026-08-19T10:00:00Z"),
            created("2026-08-10T10:00:00Z"),
            created("2026-08-11T10:00:00Z"),
        ];

        let stats = weekly_application_goal_stats(&applications, 2, at("2026-08-20T12:00:00Z"));

        assert_eq!(stats.streak_weeks, 2);
    }

    #[test]
    fn a_missed_week_ends_the_streak() {
        let applications = [
            created("2026-08-10T10:00:00Z"),
            // Nothing in the week of 2026-08-03.
            created("2026-07-28T10:00:00Z"),
        ];

        let stats = weekly_application_goal_stats(&applications, 1, at("2026-08-20T12:00:00Z"));

        assert_eq!(stats.streak_weeks, 1);
    }
}
