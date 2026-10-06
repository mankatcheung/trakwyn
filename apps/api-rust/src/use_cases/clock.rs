use chrono::{DateTime, DurationRound, TimeDelta, Utc};

/// The current instant, truncated to the millisecond.
///
/// Every timestamp column is `timestamptz(3)`, so a value with finer
/// precision would compare unequal to itself once it had been stored and read
/// back.
pub fn now() -> DateTime<Utc> {
    let now = Utc::now();
    now.duration_trunc(TimeDelta::milliseconds(1)).unwrap_or(now)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn has_no_sub_millisecond_part() {
        assert_eq!(now().timestamp_subsec_nanos() % 1_000_000, 0);
    }
}
