//! The monthly-token-limit policy, in one place (JEF-258).
//!
//! Two callers have to agree on it: the usage-summary use case, which tells
//! the user how much of their limit is gone, and the provider factory, which
//! refuses a key that has passed it. If they computed the month boundary or
//! the comparison separately, a user could watch a meter read 1.9M of 2M
//! while every AI call was already being refused.

use std::sync::Arc;

use chrono::{DateTime, Datelike, TimeZone, Utc};

use crate::use_cases::clock;

/// Reads the current instant. Injected wherever "now" decides something, so
/// a test can stand at a month boundary.
pub type Now = Arc<dyn Fn() -> DateTime<Utc> + Send + Sync>;

/// The production [`Now`]: `clock::now`.
pub fn system_now() -> Now {
    Arc::new(clock::now)
}

fn first_of_month(year: i32, month: u32) -> DateTime<Utc> {
    // Midnight on the 1st exists in every month of every year chrono can hold.
    Utc.with_ymd_and_hms(year, month, 1, 0, 0, 0).single().unwrap_or(DateTime::<Utc>::UNIX_EPOCH)
}

/// Start of the calendar month containing `now`, in UTC, matching how
/// `LlmUsageEvent.createdAt` is stored.
///
/// Usage resets monthly by construction: there is nothing to sum before the
/// 1st, so no cron job and no deletion are involved.
pub fn start_of_utc_month(now: DateTime<Utc>) -> DateTime<Utc> {
    first_of_month(now.year(), now.month())
}

/// When the allowance refills: the 1st of the following month, UTC.
pub fn start_of_next_utc_month(now: DateTime<Utc>) -> DateTime<Utc> {
    if now.month() == 12 {
        first_of_month(now.year() + 1, 1)
    } else {
        first_of_month(now.year(), now.month() + 1)
    }
}

/// Whether a key with this limit has spent it.
///
/// A limit can only be checked *before* a call, while the tokens it costs
/// are known only after, so a single long turn can end above the ceiling.
/// This is deliberately a stop-line rather than a hard cap: `>=` means the
/// key is refused from the moment it reaches the limit, and the overshoot
/// from the turn that crossed it stands.
///
/// No limit (`None`) is every key's default.
pub fn is_limit_reached(used_tokens: i64, monthly_token_limit: Option<i64>) -> bool {
    monthly_token_limit.is_some_and(|limit| used_tokens >= limit)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(text: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(text).unwrap().with_timezone(&Utc)
    }

    #[test]
    fn returns_midnight_on_the_1st_utc() {
        assert_eq!(start_of_utc_month(at("2026-07-17T15:42:09.123Z")), at("2026-07-01T00:00:00Z"));
    }

    #[test]
    fn is_idempotent_on_a_value_already_at_the_boundary() {
        let boundary = at("2026-07-01T00:00:00Z");
        assert_eq!(start_of_utc_month(boundary), boundary);
    }

    #[test]
    fn uses_utc_not_the_callers_offset() {
        // 23:30 on 30 June in New York is already July in UTC.
        assert_eq!(start_of_utc_month(at("2026-06-30T23:30:00-04:00")), at("2026-07-01T00:00:00Z"));
    }

    #[test]
    fn the_allowance_refills_on_the_1st_of_the_following_month() {
        assert_eq!(start_of_next_utc_month(at("2026-07-17T15:42:09Z")), at("2026-08-01T00:00:00Z"));
        assert_eq!(start_of_next_utc_month(at("2026-12-31T23:59:59Z")), at("2027-01-01T00:00:00Z"));
    }

    #[test]
    fn is_false_when_no_limit_is_set() {
        assert!(!is_limit_reached(10_000_000, None));
    }

    #[test]
    fn is_false_below_the_limit() {
        assert!(!is_limit_reached(999, Some(1000)));
    }

    #[test]
    fn is_true_exactly_at_the_limit() {
        assert!(is_limit_reached(1000, Some(1000)));
    }

    #[test]
    fn is_true_above_the_limit_which_a_single_turn_can_overshoot_to() {
        assert!(is_limit_reached(1500, Some(1000)));
    }

    #[test]
    fn is_false_at_zero_usage() {
        assert!(!is_limit_reached(0, Some(1000)));
    }
}
