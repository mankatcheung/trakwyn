//! String operations with JavaScript's semantics.
//!
//! Prompts are behaviour, and `apps/api` builds them with `String.prototype`
//! methods that count UTF-16 code units and have their own idea of
//! whitespace. These reproduce them so a prompt built here is the prompt
//! built there.

/// `text.length`: the number of UTF-16 code units.
pub fn utf16_len(text: &str) -> usize {
    text.encode_utf16().count()
}

/// `text.slice(0, max_units)`.
///
/// JavaScript can cut a surrogate pair in half and keep the lone half; a
/// Rust string cannot hold one, so a character that straddles the limit is
/// dropped whole. That is the only difference, and it only arises when the
/// limit lands inside an astral character.
pub fn utf16_prefix(text: &str, max_units: usize) -> &str {
    let mut units = 0;
    for (index, character) in text.char_indices() {
        units += character.len_utf16();
        if units > max_units {
            return &text[..index];
        }
    }
    text
}

/// Whether JavaScript's `trim` strips this character: the ECMAScript
/// `WhiteSpace` and `LineTerminator` sets. They differ from Unicode's
/// `White_Space` by U+0085 (not stripped) and U+FEFF (stripped).
fn is_js_whitespace(character: char) -> bool {
    (character.is_whitespace() && character != '\u{85}') || character == '\u{feff}'
}

/// `text.trim()`.
pub fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

/// `value?.trim() || null`: the trimmed text, or `None` when nothing is left.
pub fn trimmed_or_none(value: Option<&str>) -> Option<String> {
    value.map(js_trim).filter(|text| !text.is_empty()).map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_utf16_code_units_not_bytes_or_scalars() {
        assert_eq!(utf16_len("abc"), 3);
        assert_eq!(utf16_len("é"), 1);
        assert_eq!(utf16_len("😀"), 2);
    }

    #[test]
    fn a_prefix_is_measured_in_utf16_code_units() {
        assert_eq!(utf16_prefix("héllo", 2), "hé");
        assert_eq!(utf16_prefix("short", 100), "short");
        assert_eq!(utf16_prefix("a😀b", 3), "a😀");
        assert_eq!(utf16_prefix("", 0), "");
    }

    #[test]
    fn a_character_straddling_the_limit_is_dropped_whole() {
        assert_eq!(utf16_prefix("a😀b", 2), "a");
    }

    #[test]
    fn trims_what_javascript_trims() {
        assert_eq!(js_trim(" \t\r\n hi \u{a0}\u{feff}\u{2028}"), "hi");
        assert_eq!(js_trim("\u{85}hi\u{85}"), "\u{85}hi\u{85}");
        assert_eq!(js_trim("   "), "");
    }

    #[test]
    fn a_blank_or_missing_value_becomes_none() {
        assert_eq!(trimmed_or_none(Some("  x ")), Some("x".to_string()));
        assert_eq!(trimmed_or_none(Some("   ")), None);
        assert_eq!(trimmed_or_none(None), None);
    }
}
