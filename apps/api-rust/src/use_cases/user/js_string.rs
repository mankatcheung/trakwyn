//! String operations as JavaScript performs them, where the difference from
//! Rust's own would change which input is accepted: `apps/api` trims with
//! `String.prototype.trim`, matches `\s` and measures `.length`.

/// ECMAScript `WhiteSpace` or `LineTerminator`: what `trim()` strips and `\s`
/// matches. Unlike `char::is_whitespace` it includes U+FEFF and excludes
/// U+0085.
pub fn is_js_whitespace(c: char) -> bool {
    matches!(
        c,
        '\u{0009}'
            | '\u{000A}'
            | '\u{000B}'
            | '\u{000C}'
            | '\u{000D}'
            | '\u{0020}'
            | '\u{00A0}'
            | '\u{1680}'
            | '\u{2000}'
            ..='\u{200A}'
                | '\u{2028}'
                | '\u{2029}'
                | '\u{202F}'
                | '\u{205F}'
                | '\u{3000}'
                | '\u{FEFF}'
    )
}

/// `value.trim()`.
pub fn js_trim(value: &str) -> &str {
    value.trim_matches(is_js_whitespace)
}

/// `value.length`: UTF-16 code units.
pub fn utf16_len(value: &str) -> usize {
    value.encode_utf16().count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn trims_what_javascript_trims() {
        assert_eq!(js_trim(" \t\r\n\u{00A0}\u{FEFF}\u{2028}Ada \u{3000}"), "Ada");
        assert_eq!(js_trim("   "), "");
        assert_eq!(js_trim("in the middle"), "in the middle");
    }

    #[test]
    fn leaves_next_line_alone_as_javascript_does() {
        // U+0085 is White_Space to Unicode but not to ECMAScript.
        assert_eq!(js_trim("\u{0085}x\u{0085}"), "\u{0085}x\u{0085}");
        assert!(!is_js_whitespace('\u{0085}'));
    }

    #[test]
    fn measures_utf16_code_units() {
        assert_eq!(utf16_len("abc"), 3);
        assert_eq!(utf16_len("é"), 1);
        assert_eq!(utf16_len("😀"), 2);
    }
}
