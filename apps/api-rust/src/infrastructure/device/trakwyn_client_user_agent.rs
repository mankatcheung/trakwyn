use std::sync::LazyLock;

use regex::Regex;

/// The parts of a Trakwyn mobile app User-Agent. An empty part is `None`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TrakwynClientUserAgent {
    pub version: String,
    pub model: Option<String>,
    /// The whole OS part, e.g. `iOS 17.4`.
    pub os: Option<String>,
    pub os_name: Option<String>,
    pub os_version: Option<String>,
}

static MOBILE_USER_AGENT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^TrakwynMobile/(\S+)\s+\(([^;)]*);([^)]*)\)").expect("a valid pattern")
});

fn present(part: &str) -> Option<String> {
    let trimmed = part.trim();
    (!trimmed.is_empty()).then(|| trimmed.to_string())
}

/// `iOS 17.4` → `iOS` / `17.4`; `Android` → `Android` with no version.
fn split_os(os: &str) -> (String, Option<String>) {
    match os.rfind(' ') {
        None => (os.to_string(), None),
        Some(last_space) => (os[..last_space].to_string(), Some(os[last_space + 1..].to_string())),
    }
}

/// Parses the User-Agent apps/mobile sends,
/// `TrakwynMobile/<version> (<model>; <os> <os version>)`, or returns `None`
/// for any other client. Shared by the session label (`DeviceLabelService`)
/// and the request's client identity, so the two cannot read the format
/// differently.
pub fn parse_trakwyn_client_user_agent(user_agent: Option<&str>) -> Option<TrakwynClientUserAgent> {
    let captures = MOBILE_USER_AGENT.captures(user_agent?)?;

    let os = present(&captures[3]);
    let (os_name, os_version) = match os.as_deref().map(split_os) {
        Some((name, version)) => (Some(name), version),
        None => (None, None),
    };
    Some(TrakwynClientUserAgent {
        version: captures[1].to_string(),
        model: present(&captures[2]),
        os,
        os_name,
        os_version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(user_agent: &str) -> Option<TrakwynClientUserAgent> {
        parse_trakwyn_client_user_agent(Some(user_agent))
    }

    fn some(value: &str) -> Option<String> {
        Some(value.to_string())
    }

    #[test]
    fn splits_a_full_mobile_user_agent_into_version_model_and_os() {
        assert_eq!(
            parse("TrakwynMobile/1.2.3 (iPhone 15 Pro; iOS 17.4)"),
            Some(TrakwynClientUserAgent {
                version: "1.2.3".to_string(),
                model: some("iPhone 15 Pro"),
                os: some("iOS 17.4"),
                os_name: some("iOS"),
                os_version: some("17.4"),
            })
        );
    }

    #[test]
    fn splits_the_os_on_its_last_space_so_a_multi_word_os_name_stays_whole() {
        let parsed = parse("TrakwynMobile/1.0.0 (iPad Air; iPadOS Beta 18.0)").unwrap();

        assert_eq!(parsed.os_name, some("iPadOS Beta"));
        assert_eq!(parsed.os_version, some("18.0"));
    }

    #[test]
    fn leaves_out_a_model_the_app_could_not_read() {
        assert_eq!(
            parse("TrakwynMobile/1.2.3 (; iOS 17.4)"),
            Some(TrakwynClientUserAgent {
                version: "1.2.3".to_string(),
                model: None,
                os: some("iOS 17.4"),
                os_name: some("iOS"),
                os_version: some("17.4"),
            })
        );
    }

    #[test]
    fn reads_an_os_with_no_version_as_a_name_only() {
        assert_eq!(
            parse("TrakwynMobile/1.2.3 (Pixel 8; android)"),
            Some(TrakwynClientUserAgent {
                version: "1.2.3".to_string(),
                model: some("Pixel 8"),
                os: some("android"),
                os_name: some("android"),
                os_version: None,
            })
        );
    }

    #[test]
    fn keeps_the_version_when_both_model_and_os_are_empty() {
        assert_eq!(
            parse("TrakwynMobile/0.0.0 (; )"),
            Some(TrakwynClientUserAgent {
                version: "0.0.0".to_string(),
                model: None,
                os: None,
                os_name: None,
                os_version: None,
            })
        );
    }

    #[test]
    fn ignores_whatever_follows_the_parenthesis() {
        let parsed = parse("TrakwynMobile/2.0.0 (Pixel 8; Android 14) okhttp/4.12.0").unwrap();

        assert_eq!(parsed.version, "2.0.0");
        assert_eq!(parsed.os, some("Android 14"));
    }

    #[test]
    fn returns_none_for_a_browser_user_agent() {
        assert_eq!(
            parse(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            None
        );
    }

    #[test]
    fn returns_none_for_the_native_http_stacks_the_app_replaces() {
        assert_eq!(parse("Trakwyn/1 CFNetwork/1498.700.2 Darwin/23.6.0"), None);
        assert_eq!(parse("okhttp/4.12.0"), None);
    }

    #[test]
    fn returns_none_for_a_missing_empty_or_malformed_value() {
        assert_eq!(parse_trakwyn_client_user_agent(None), None);
        assert_eq!(parse(""), None);
        assert_eq!(parse("TrakwynMobile/1.2.3"), None);
        assert_eq!(parse("TrakwynMobile/ (iPhone; iOS 17)"), None);
        assert_eq!(parse("x TrakwynMobile/1.2.3 (iPhone; iOS 17)"), None);
        assert_eq!(parse("TrakwynMobile/1.2.3 (iPhone iOS 17)"), None);
    }
}
