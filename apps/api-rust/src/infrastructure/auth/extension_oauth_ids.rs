//! Chrome's `chrome.identity.launchWebAuthFlow` redirect target (JEF-383).
//! Chrome intercepts navigations to the `chromiumapp.org` host of an
//! extension and hands the URL back to the extension with that ID, so a
//! handoff code sent there reaches only it.

use std::collections::BTreeSet;

/// A Chrome extension ID: 32 characters from `a` to `p`.
const ID_LENGTH: usize = 32;

fn is_extension_id(id: &str) -> bool {
    id.len() == ID_LENGTH && id.bytes().all(|b| (b'a'..=b'p').contains(&b))
}

/// Parses `EXTENSION_OAUTH_IDS` into the set of Chrome extension IDs allowed
/// to finish an OAuth login. Anything that isn't a well-formed ID is dropped
/// rather than trusted, since each entry becomes a redirect host.
pub fn parse_extension_oauth_ids(raw: Option<&str>) -> BTreeSet<String> {
    raw.unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|id| is_extension_id(id))
        .map(str::to_string)
        .collect()
}

pub fn extension_redirect_url(extension_id: &str) -> String {
    format!("https://{extension_id}.chromiumapp.org/")
}

#[cfg(test)]
mod tests {
    use super::*;

    const ID_A: &str = "abcdefghijklmnopabcdefghijklmnop";
    const ID_B: &str = "ponmlkjihgfedcbaponmlkjihgfedcba";

    #[test]
    fn is_empty_when_the_env_var_is_unset() {
        assert!(parse_extension_oauth_ids(None).is_empty());
        assert!(parse_extension_oauth_ids(Some("")).is_empty());
    }

    #[test]
    fn parses_a_comma_separated_list_trimming_whitespace() {
        let ids = parse_extension_oauth_ids(Some(&format!(" {ID_A} ,{ID_B}")));
        assert_eq!(ids.into_iter().collect::<Vec<_>>(), vec![ID_A, ID_B]);
    }

    #[test]
    fn drops_anything_that_is_not_a_chrome_extension_id() {
        let raw = format!(
            "{ID_A},evil.example.com,{},{ID_A}z,,abcdefghijklmnopqrstuvwxyzabcdef",
            ID_A.to_uppercase()
        );
        let ids = parse_extension_oauth_ids(Some(&raw));
        assert_eq!(ids.into_iter().collect::<Vec<_>>(), vec![ID_A]);
    }

    #[test]
    fn builds_the_chromiumapp_redirect_url() {
        assert_eq!(extension_redirect_url(ID_A), format!("https://{ID_A}.chromiumapp.org/"));
    }
}
