//! How `apps/api`'s resolvers read an optional input field, where "absent",
//! `null` and `""` do not always mean the same thing.

use async_graphql::MaybeUndefined;

use super::js_date::parse_js_date;
use crate::use_cases::client_date::ClientDate;

/// `value ?? undefined`: absent and `null` both leave the field alone.
pub fn present(value: MaybeUndefined<String>) -> Option<String> {
    value.take()
}

/// Passed through as it is: absent leaves the field alone, `null` clears it.
pub fn nullable(value: MaybeUndefined<String>) -> Option<Option<String>> {
    match value {
        MaybeUndefined::Undefined => None,
        MaybeUndefined::Null => Some(None),
        MaybeUndefined::Value(value) => Some(Some(value)),
    }
}

/// `value ? new Date(value) : <nothing>`: an empty string counts as absent.
pub fn date_if_given(value: Option<String>) -> Option<ClientDate> {
    value.filter(|text| !text.is_empty()).map(|text| parse_js_date(&text))
}

/// `value === null ? null : value ? new Date(value) : undefined`: `null`
/// clears the date, an empty string leaves it alone.
pub fn nullable_date(value: MaybeUndefined<String>) -> Option<Option<ClientDate>> {
    match value {
        MaybeUndefined::Null => Some(None),
        MaybeUndefined::Undefined => None,
        MaybeUndefined::Value(text) => date_if_given(Some(text)).map(Some),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn value(text: &str) -> MaybeUndefined<String> {
        MaybeUndefined::Value(text.to_string())
    }

    #[test]
    fn present_treats_null_as_absent_and_keeps_an_empty_string() {
        assert_eq!(present(MaybeUndefined::Undefined), None);
        assert_eq!(present(MaybeUndefined::Null), None);
        assert_eq!(present(value("")), Some(String::new()));
    }

    #[test]
    fn nullable_tells_null_from_absent() {
        assert_eq!(nullable(MaybeUndefined::Undefined), None);
        assert_eq!(nullable(MaybeUndefined::Null), Some(None));
        assert_eq!(nullable(value("x")), Some(Some("x".to_string())));
    }

    #[test]
    fn an_empty_date_string_counts_as_absent() {
        assert_eq!(date_if_given(None), None);
        assert_eq!(date_if_given(Some(String::new())), None);
        assert!(matches!(date_if_given(Some("2024-01-15".to_string())), Some(ClientDate::Valid(_))));
        assert_eq!(date_if_given(Some("nope".to_string())), Some(ClientDate::Invalid));
    }

    #[test]
    fn a_nullable_date_is_cleared_only_by_null() {
        assert_eq!(nullable_date(MaybeUndefined::Undefined), None);
        assert_eq!(nullable_date(MaybeUndefined::Null), Some(None));
        assert_eq!(nullable_date(value("")), None);
        assert!(matches!(nullable_date(value("2024-01-15")), Some(Some(ClientDate::Valid(_)))));
    }
}
