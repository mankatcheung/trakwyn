//! `new Date(text)` for the date strings clients send.
//!
//! `apps/api`'s resolvers turn a date argument into a `Date` with
//! `new Date(text)`, so what counts as a date is whatever V8 accepts. This
//! reads the ECMAScript date-time string format the way V8 does:
//!
//! - `YYYY`, `YYYY-MM`, `YYYY-MM-DD` (and the `±YYYYYY` expanded years) are
//!   UTC midnight;
//! - with a time (`THH:mm`, `THH:mm:ss`, `THH:mm:ss.s…`) and no offset the
//!   time is local, and the API runs in UTC, so it is read as UTC;
//! - an offset is `Z`, `±HH:mm` or `±HHmm`;
//! - a day up to 31 is accepted in any month and rolls over (`2024-02-30` is
//!   1 March), and `24:00:00` is the next midnight;
//! - fractional seconds beyond milliseconds are dropped.
//!
//! V8 also has a legacy fallback that reads free-form text such as
//! `Jan 5 2024`, `2024-1-5` or `-000000-01-01`. That is not ported: such
//! text is an Invalid Date here.

use chrono::{DateTime, NaiveDate, TimeDelta, Utc};

use crate::use_cases::client_date::ClientDate;

/// The furthest a `Date` reaches from the epoch, in milliseconds.
const MAX_TIME_MS: i64 = 8_640_000_000_000_000;

struct Cursor<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl Cursor<'_> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.position).copied()
    }

    fn eat(&mut self, byte: u8) -> bool {
        let found = self.peek() == Some(byte);
        if found {
            self.position += 1;
        }
        found
    }

    /// Exactly `count` digits, as a number.
    fn digits(&mut self, count: usize) -> Option<i64> {
        let end = self.position.checked_add(count)?;
        let digits = self.bytes.get(self.position..end)?;
        if !digits.iter().all(u8::is_ascii_digit) {
            return None;
        }
        self.position = end;
        Some(digits.iter().fold(0, |value, digit| value * 10 + i64::from(digit - b'0')))
    }

    fn at_end(&self) -> bool {
        self.position == self.bytes.len()
    }
}

fn year(cursor: &mut Cursor<'_>) -> Option<i64> {
    match cursor.peek()? {
        sign @ (b'+' | b'-') => {
            cursor.position += 1;
            let year = cursor.digits(6)?;
            // `-000000` is not a year.
            match (sign, year) {
                (b'-', 0) => None,
                (b'-', year) => Some(-year),
                (_, year) => Some(year),
            }
        }
        _ => cursor.digits(4),
    }
}

/// Milliseconds past midnight, from `HH:mm[:ss[.s…]]`.
fn time_of_day(cursor: &mut Cursor<'_>) -> Option<i64> {
    let hour = cursor.digits(2)?;
    if !cursor.eat(b':') {
        return None;
    }
    let minute = cursor.digits(2)?;
    let mut second = 0;
    let mut millisecond = 0;
    if cursor.eat(b':') {
        second = cursor.digits(2)?;
        if cursor.eat(b'.') {
            let start = cursor.position;
            while cursor.peek().is_some_and(|byte| byte.is_ascii_digit()) {
                cursor.position += 1;
            }
            let fraction = &cursor.bytes[start..cursor.position];
            if fraction.is_empty() {
                return None;
            }
            // The first three digits, right-padded: `.5` is 500 ms.
            millisecond = (0..3).fold(0, |value, index| {
                value * 10 + fraction.get(index).map_or(0, |digit| i64::from(digit - b'0'))
            });
        }
    }

    let in_range = hour <= 23 && minute <= 59 && second <= 59;
    let end_of_day = hour == 24 && minute == 0 && second == 0 && millisecond == 0;
    (in_range || end_of_day).then_some(((hour * 60 + minute) * 60 + second) * 1000 + millisecond)
}

/// Milliseconds east of UTC, from `Z`, `±HH:mm` or `±HHmm`.
fn offset(cursor: &mut Cursor<'_>) -> Option<i64> {
    if cursor.eat(b'Z') {
        return Some(0);
    }
    let sign = match cursor.peek()? {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    cursor.position += 1;
    let hour = cursor.digits(2)?;
    cursor.eat(b':');
    let minute = cursor.digits(2)?;
    (hour <= 23 && minute <= 59).then_some(sign * (hour * 60 + minute) * 60_000)
}

fn parse(text: &str) -> Option<DateTime<Utc>> {
    let mut cursor = Cursor { bytes: text.trim().as_bytes(), position: 0 };

    let year = year(&mut cursor)?;
    let mut month = 1;
    let mut day = 1;
    if cursor.eat(b'-') {
        month = cursor.digits(2)?;
        if cursor.eat(b'-') {
            day = cursor.digits(2)?;
        }
    }
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut time_ms = 0;
    let mut offset_ms = 0;
    if cursor.eat(b'T') || cursor.eat(b' ') {
        time_ms = time_of_day(&mut cursor)?;
        if !cursor.at_end() {
            offset_ms = offset(&mut cursor)?;
        }
    }
    if !cursor.at_end() {
        return None;
    }

    let first_of_month =
        NaiveDate::from_ymd_opt(i32::try_from(year).ok()?, u32::try_from(month).ok()?, 1)?;
    let instant = first_of_month.and_hms_opt(0, 0, 0)?.and_utc()
        + TimeDelta::days(day - 1)
        + TimeDelta::milliseconds(time_ms - offset_ms);
    (instant.timestamp_millis().abs() <= MAX_TIME_MS).then_some(instant)
}

/// The `Date` that `new Date(text)` builds.
pub fn parse_js_date(text: &str) -> ClientDate {
    parse(text).map_or(ClientDate::Invalid, ClientDate::Valid)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::http::graphql::support::iso;

    /// Expected values are what Node prints for
    /// `new Date(text).toISOString()` with `TZ=UTC`.
    #[test]
    fn reads_the_iso_forms_as_v8_does() {
        let cases = [
            ("2024-01-15", "2024-01-15T00:00:00.000Z"),
            ("2024-01", "2024-01-01T00:00:00.000Z"),
            ("2024", "2024-01-01T00:00:00.000Z"),
            ("2024-01-15T10:30", "2024-01-15T10:30:00.000Z"),
            ("2024-01-15T10:30:45", "2024-01-15T10:30:45.000Z"),
            ("2024-01-15T10:30:45.5", "2024-01-15T10:30:45.500Z"),
            ("2024-01-15T10:30:45.123456Z", "2024-01-15T10:30:45.123Z"),
            ("2024-01-15T10:30:00.000Z", "2024-01-15T10:30:00.000Z"),
            ("2024-01-15T10:30:00+02:00", "2024-01-15T08:30:00.000Z"),
            ("2024-01-15T10:30:00-0530", "2024-01-15T16:00:00.000Z"),
            ("2024-01-15 10:30", "2024-01-15T10:30:00.000Z"),
            ("2024-01-15T24:00:00", "2024-01-16T00:00:00.000Z"),
            ("2024-02-30", "2024-03-01T00:00:00.000Z"),
            ("2023-02-31", "2023-03-03T00:00:00.000Z"),
            ("+002024-01-15", "2024-01-15T00:00:00.000Z"),
            ("  2024-01-15  ", "2024-01-15T00:00:00.000Z"),
        ];
        for (text, expected) in cases {
            match parse_js_date(text) {
                ClientDate::Valid(instant) => assert_eq!(iso(instant), expected, "{text}"),
                ClientDate::Invalid => panic!("{text} should be a date"),
            }
        }
    }

    #[test]
    fn anything_else_is_an_invalid_date() {
        for text in [
            "",
            "not a date",
            "2024-13-01",
            "2024-00-10",
            "2024-01-32",
            "2024-01-00",
            "2024-01-15T25:00",
            "2024-01-15T24:00:01",
            "2024-01-15T10:60",
            "2024-01-15T10",
            "2024-01-15T10:30:45.",
            "2024-01-15T10:30+25:00",
            "2024-01-15T10:30Zjunk",
        ] {
            assert_eq!(parse_js_date(text), ClientDate::Invalid, "{text}");
        }
    }
}
