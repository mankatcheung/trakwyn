use std::sync::Arc;

use chrono_tz::Tz;

use super::js_string::{js_trim, utf16_len};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::{UpdateUserData, UserRepository};

const MAX_NAME_LENGTH: usize = 100;
const MAX_TARGET_ROLE_LENGTH: usize = 100;
const MAX_AI_PROMPT_LENGTH: usize = 500;

/// A text field is `None` when the caller did not mention it, `Some(None)`
/// when it sent null, and `Some(Some(_))` when it sent a value.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct UpdateProfileInput {
    pub user_id: String,
    pub name: Option<Option<String>>,
    pub timezone: Option<Option<String>>,
    pub target_role: Option<Option<String>>,
    pub custom_ai_prompt: Option<Option<String>>,
    pub use_cross_application_context: Option<bool>,
    pub llm_fallback_when_limited: Option<bool>,
}

/// A fixed UTC offset as `Intl.DateTimeFormat` accepts one: `±HH`, `±HHmm` or
/// `±HH:mm`, hours to 23 and minutes to 59. U+2212 is accepted as the minus.
fn is_utc_offset(timezone: &str) -> bool {
    let Some(digits) = timezone.strip_prefix(['+', '-', '\u{2212}']) else { return false };
    let (hours, minutes) = match digits.len() {
        2 => (digits, "00"),
        4 => digits.split_at(2),
        5 if digits.as_bytes()[2] == b':' => (&digits[..2], &digits[3..]),
        _ => return false,
    };
    let number = |text: &str| -> Option<u32> {
        text.bytes().all(|b| b.is_ascii_digit()).then(|| text.parse().ok()).flatten()
    };
    matches!((number(hours), number(minutes)), (Some(hours), Some(minutes)) if hours <= 23 && minutes <= 59)
}

/// Whether `Intl.DateTimeFormat(undefined, { timeZone })` would accept the
/// name: an IANA zone or link, matched without regard to case, or an offset.
fn is_valid_timezone(timezone: &str) -> bool {
    is_utc_offset(timezone) || Tz::from_str_insensitive(timezone).is_ok()
}

/// Trims a nullable text field; an empty result clears the field. A field the
/// caller did not mention stays untouched.
fn normalize(value: Option<Option<String>>) -> Option<Option<String>> {
    value.map(|value| {
        value.and_then(|text| {
            let trimmed = js_trim(&text);
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        })
    })
}

fn longer_than(value: &Option<Option<String>>, max: usize) -> bool {
    matches!(value, Some(Some(text)) if utf16_len(text) > max)
}

pub struct UpdateProfileUseCase {
    pub user_repository: Arc<dyn UserRepository>,
}

impl UpdateProfileUseCase {
    pub async fn execute(&self, input: UpdateProfileInput) -> DomainResult<()> {
        self.user_repository
            .find_by_id(&input.user_id)
            .await?
            .ok_or_else(|| DomainError::not_found("User not found"))?;

        let name = normalize(input.name);
        let timezone = normalize(input.timezone);
        let target_role = normalize(input.target_role);
        let custom_ai_prompt = normalize(input.custom_ai_prompt);

        if longer_than(&name, MAX_NAME_LENGTH) {
            return Err(DomainError::validation("Name is too long"));
        }
        if longer_than(&target_role, MAX_TARGET_ROLE_LENGTH) {
            return Err(DomainError::validation("Target role is too long"));
        }
        if longer_than(&custom_ai_prompt, MAX_AI_PROMPT_LENGTH) {
            return Err(DomainError::validation("AI prompt is too long"));
        }
        if matches!(&timezone, Some(Some(timezone)) if !is_valid_timezone(timezone)) {
            return Err(DomainError::validation("Invalid timezone"));
        }

        self.user_repository
            .update(
                &input.user_id,
                UpdateUserData {
                    name,
                    timezone,
                    target_role,
                    custom_ai_prompt,
                    use_cross_application_context: input.use_cross_application_context,
                    llm_fallback_when_limited: input.llm_fallback_when_limited,
                    ..UpdateUserData::default()
                },
            )
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Each answer is what `Intl.DateTimeFormat(undefined, { timeZone })`
    /// does under Node 24: construct, or throw a `RangeError`.
    #[test]
    fn accepts_and_refuses_the_names_node_does() {
        let accepted = [
            "UTC",
            "utc",
            "Europe/London",
            "europe/london",
            "US/Eastern",
            "Etc/GMT+5",
            "GMT",
            "EST",
            "EST5EDT",
            "America/Argentina/Buenos_Aires",
            "Asia/Calcutta",
            "Asia/Kolkata",
            "PST8PDT",
            "UCT",
            "Zulu",
            "GB",
            "CET",
            "Europe/Kyiv",
            "+01:00",
            "+0100",
            "+01",
            "-23:59",
            "+00:00",
            "-00:00",
            "+23:59",
            "\u{2212}01:00",
        ];
        for timezone in accepted {
            assert!(is_valid_timezone(timezone), "{timezone} should be accepted");
        }

        let refused = [
            "Z",
            "+24:00",
            "+23:60",
            "+1:00",
            "+01:00:00",
            "Mars/Phobos",
            "",
            "Etc/Unknown",
            "UTC+1",
            "Factory",
            "localtime",
            " UTC",
        ];
        for timezone in refused {
            assert!(!is_valid_timezone(timezone), "{timezone:?} should be refused");
        }
    }
}
