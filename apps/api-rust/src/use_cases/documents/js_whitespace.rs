//! JavaScript's notion of whitespace, which differs from Rust's at the
//! edges: `char::is_whitespace` counts U+0085 and not U+FEFF, JavaScript the
//! reverse. Stored names and titles must come out the same from either API.

/// What `\s` matches in a JavaScript regular expression, which is also what
/// `String.prototype.trim` strips.
pub fn is_js_whitespace(character: char) -> bool {
    matches!(
        character,
        '\t' | '\n' | '\u{000B}' | '\u{000C}' | '\r' | ' ' | '\u{00A0}' | '\u{1680}' | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `String.prototype.trim`.
pub fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_whitespace)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_what_javascript_trims() {
        assert_eq!(js_trim(" \t\r\n\u{00A0}\u{FEFF}title\u{2028}\u{3000} "), "title");
        assert_eq!(js_trim("   "), "");
        assert_eq!(js_trim("two words"), "two words");
    }

    #[test]
    fn leaves_a_next_line_character_alone() {
        assert_eq!(js_trim("\u{0085}title\u{0085}"), "\u{0085}title\u{0085}");
    }
}
