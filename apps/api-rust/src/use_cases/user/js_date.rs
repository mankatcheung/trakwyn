//! Reading a timestamp out of an import file the way `new Date(string)` does
//! for the formats an export contains.
//!
//! Covers the ECMAScript date-time string format (`2026-01-31T09:30:00.000Z`
//! and its shorter forms). V8 also accepts free-form dates ("Jan 5 2024");
//! those are not recognised here and read as "no date".

use chrono::{DateTime, NaiveDate, TimeDelta, Utc};

const MS_PER_MINUTE: i64 = 60_000;

struct Cursor<'a> {
    rest: &'a str,
}

impl<'a> Cursor<'a> {
    /// Exactly `count` ASCII digits.
    fn digits(&mut self, count: usize) -> Option<i64> {
        let head = self.rest.get(..count)?;
        if !head.bytes().all(|b| b.is_ascii_digit()) {
            return None;
        }
        self.rest = &self.rest[count..];
        head.parse().ok()
    }

    fn eat(&mut self, expected: char) -> bool {
        match self.rest.strip_prefix(expected) {
            Some(rest) => {
                self.rest = rest;
                true
            }
            None => false,
        }
    }

    fn eat_any(&mut self, expected: &[char]) -> Option<char> {
        expected.iter().copied().find(|c| self.eat(*c))
    }

    fn is_empty(&self) -> bool {
        self.rest.is_empty()
    }
}

/// `YYYY` or the expanded `±YYYYYY`. `-000000` is not a year.
fn year(cursor: &mut Cursor<'_>) -> Option<i64> {
    match cursor.eat_any(&['+', '-']) {
        Some(sign) => {
            let year = cursor.digits(6)?;
            match (sign, year) {
                ('-', 0) => None,
                ('-', year) => Some(-year),
                (_, year) => Some(year),
            }
        }
        None => cursor.digits(4),
    }
}

/// Milliseconds since midnight, from `HH:mm[:ss[.fff…]]`. Digits past the
/// third fractional one are dropped, as V8 drops them.
fn time_of_day(cursor: &mut Cursor<'_>) -> Option<i64> {
    let hour = cursor.digits(2)?;
    if !cursor.eat(':') {
        return None;
    }
    let minute = cursor.digits(2)?;
    let mut second = 0;
    let mut millis = 0;
    if cursor.eat(':') {
        second = cursor.digits(2)?;
        if cursor.eat('.') {
            let fraction: String = cursor.rest.chars().take_while(char::is_ascii_digit).collect();
            if fraction.is_empty() {
                return None;
            }
            cursor.rest = &cursor.rest[fraction.len()..];
            let padded = format!("{fraction:0<3}");
            millis = padded[..3].parse().ok()?;
        }
    }
    let end_of_day = hour == 24 && minute == 0 && second == 0 && millis == 0;
    if (hour > 23 && !end_of_day) || minute > 59 || second > 59 {
        return None;
    }
    Some(((hour * 60 + minute) * 60 + second) * 1000 + millis)
}

/// Milliseconds east of UTC, from `Z`, `±HH:mm` or `±HHmm`. `None` inside the
/// option is "no offset written".
fn offset(cursor: &mut Cursor<'_>) -> Option<Option<i64>> {
    if cursor.eat_any(&['Z', 'z']).is_some() {
        return Some(Some(0));
    }
    let Some(sign) = cursor.eat_any(&['+', '-']) else { return Some(None) };
    let hour = cursor.digits(2)?;
    cursor.eat(':');
    let minute = cursor.digits(2)?;
    if hour > 23 || minute > 59 {
        return None;
    }
    let magnitude = (hour * 60 + minute) * MS_PER_MINUTE;
    Some(Some(if sign == '-' { -magnitude } else { magnitude }))
}

/// The instant `new Date(value)` names, or `None` where it is an Invalid Date
/// (or a format this does not recognise).
///
/// A date-time with no offset is local time to JavaScript. It is read as UTC
/// here, which is what `apps/api` does where it runs (its hosts are on UTC).
pub fn parse_js_date(value: &str) -> Option<DateTime<Utc>> {
    let mut cursor = Cursor { rest: value };

    let year = year(&mut cursor)?;
    let (mut month, mut day) = (1, 1);
    if cursor.eat('-') {
        month = cursor.digits(2)?;
        if cursor.eat('-') {
            day = cursor.digits(2)?;
        }
    }
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }

    let mut millis_of_day = 0;
    let mut offset_ms = 0;
    if cursor.eat_any(&['T', 't', ' ']).is_some() {
        millis_of_day = time_of_day(&mut cursor)?;
        offset_ms = offset(&mut cursor)?.unwrap_or(0);
    }
    if !cursor.is_empty() {
        return None;
    }

    // A day past the month's end rolls into the next month, as in JavaScript.
    let first = NaiveDate::from_ymd_opt(i32::try_from(year).ok()?, u32::try_from(month).ok()?, 1)?;
    let midnight = first.and_hms_opt(0, 0, 0)?.and_utc();
    midnight
        .checked_add_signed(TimeDelta::days(day - 1))?
        .checked_add_signed(TimeDelta::milliseconds(millis_of_day - offset_ms))
}

#[cfg(test)]
mod tests {
    use chrono::SecondsFormat;

    use super::*;

    fn iso(value: &str) -> Option<String> {
        parse_js_date(value).map(|date| date.to_rfc3339_opts(SecondsFormat::Millis, true))
    }

    /// Each pair is `new Date(input).toISOString()` under Node 24 (TZ=UTC).
    #[test]
    fn reads_what_node_reads() {
        let cases = [
            ("2024-01-15T10:00:00.000Z", "2024-01-15T10:00:00.000Z"),
            ("2024-01-15", "2024-01-15T00:00:00.000Z"),
            ("2024-01", "2024-01-01T00:00:00.000Z"),
            ("2024", "2024-01-01T00:00:00.000Z"),
            ("2024-01-15T10:00", "2024-01-15T10:00:00.000Z"),
            ("2024-01-15T10:00:00+02:00", "2024-01-15T08:00:00.000Z"),
            ("2024-01-15T10:00:00+0200", "2024-01-15T08:00:00.000Z"),
            ("2024-01-15 10:00:00", "2024-01-15T10:00:00.000Z"),
            ("2024-02-30", "2024-03-01T00:00:00.000Z"),
            ("2024-01-15T24:00:00Z", "2024-01-16T00:00:00.000Z"),
            ("+002024-01-15T00:00:00Z", "2024-01-15T00:00:00.000Z"),
            ("2024-01-15T10:00:00.123456Z", "2024-01-15T10:00:00.123Z"),
            ("2024-01-15T23:59:59.9999Z", "2024-01-15T23:59:59.999Z"),
            ("2024-01-15T10:00:00.1Z", "2024-01-15T10:00:00.100Z"),
            ("2024-01-15T10:00:00z", "2024-01-15T10:00:00.000Z"),
            ("2024-01-15t10:00:00Z", "2024-01-15T10:00:00.000Z"),
        ];
        for (input, expected) in cases {
            assert_eq!(iso(input).as_deref(), Some(expected), "{input}");
        }
    }

    /// Each of these is an Invalid Date under Node 24.
    #[test]
    fn refuses_what_node_refuses() {
        let cases = [
            "",
            "abc",
            "2024-13-01",
            "20240115",
            "2024-01-15T10Z",
            "2024-01-15T10:00:60Z",
            " 2024-01-15T10:00:00.000Z",
            "2024-01-15T10:00:00+02",
            "-000000-01-01T00:00:00Z",
            "2024-01-15T10:00:00.Z",
            "2024-01-15T10:00:00,5Z",
            "2024-01-15T24:00:01Z",
            "2024-01-15T10:00:00Zjunk",
        ];
        for input in cases {
            assert_eq!(iso(input), None, "{input:?}");
        }
    }

    #[test]
    fn free_form_dates_are_not_recognised() {
        // V8 reads both; this port does not (see the module note).
        assert_eq!(iso("Jan 5 2024"), None);
        assert_eq!(iso("2024-1-5"), None);
    }
}
