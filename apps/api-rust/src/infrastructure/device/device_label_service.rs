use std::sync::LazyLock;

use regex::Regex;

use super::trakwyn_client_user_agent::parse_trakwyn_client_user_agent;
use crate::use_cases::ports::DeviceLabeler;

const UNKNOWN_DEVICE: &str = "Unknown device";

fn pattern(pattern: &str) -> Regex {
    Regex::new(pattern).expect("a valid pattern")
}

static ANDROID_MODEL: LazyLock<Regex> = LazyLock::new(|| pattern(r";\s*([^;)]+)\s*Build"));
static CHROME: LazyLock<Regex> = LazyLock::new(|| pattern(r"Chrome/([0-9.]+)"));
static FIREFOX: LazyLock<Regex> = LazyLock::new(|| pattern(r"Firefox/([0-9.]+)"));
/// `.` here stops at a line break, as it does in JavaScript.
static SAFARI: LazyLock<Regex> =
    LazyLock::new(|| pattern(r"Version/([0-9.]+)[^\n\r\x{2028}\x{2029}]*Safari"));

/// Parses a raw User-Agent string into a human-readable device label.
///
/// The label is intentionally short (e.g. "Mac — Chrome 120") so it fits
/// nicely in the active-sessions UI without wrapping.
#[derive(Debug, Default, Clone, Copy)]
pub struct DeviceLabelService;

impl DeviceLabelService {
    pub fn new() -> Self {
        Self
    }

    /// apps/mobile sends `TrakwynMobile/<version> (<model>; <os> <version>)`.
    /// Without this the phone arrives as OkHttp's or CFNetwork's default
    /// string, which nothing below recognises.
    fn parse_mobile_app(ua: &str) -> Option<String> {
        let app = parse_trakwyn_client_user_agent(Some(ua))?;
        Some(match app.model.or(app.os) {
            Some(device) => format!("{device} — Trakwyn app"),
            None => "Trakwyn app".to_string(),
        })
    }

    fn parse_os(ua: &str) -> Option<String> {
        let os = if ua.contains("Windows") {
            "Windows PC"
        } else if ua.contains("Mac OS X") {
            "Mac"
        } else if ua.contains("CrOS") {
            "Chromebook"
        } else if ua.contains("Android") {
            return Some(Self::format_android_device(ua));
        } else if ua.contains("iPhone") {
            "iPhone"
        } else if ua.contains("iPad") {
            "iPad"
        } else if ua.contains("Linux") {
            "Linux device"
        } else {
            return None;
        };
        Some(os.to_string())
    }

    fn format_android_device(ua: &str) -> String {
        let model = ANDROID_MODEL.captures(ua).map(|captures| captures[1].trim().to_string());
        match model.filter(|model| !model.is_empty()) {
            Some(model) => format!("Android ({model})"),
            None => "Android device".to_string(),
        }
    }

    fn parse_browser(ua: &str) -> Option<String> {
        // Order matters: some brands embed others (e.g. "Edg" inside a Chrome-like UA).
        if ua.contains("Edg/") {
            return Some("Edge".to_string());
        }
        if ua.contains("OPR/") || ua.contains("Opera") {
            return Some("Opera".to_string());
        }
        if ua.contains("Vivaldi") {
            return Some("Vivaldi".to_string());
        }
        if ua.contains("Brave") {
            return Some("Brave".to_string());
        }

        let has_safari = ua.contains("Safari/");
        if let Some(chrome) = CHROME.captures(ua) {
            // If it also has Safari, it's a real Chrome/Chromium, not an iOS wrapper.
            if has_safari {
                return Some(format!("Chrome {}", &chrome[1]));
            }
            // iOS Chrome is actually WebKit under the hood.
            return Some("Chrome".to_string());
        }

        if let Some(firefox) = FIREFOX.captures(ua) {
            return Some(format!("Firefox {}", &firefox[1]));
        }

        if let Some(safari) = SAFARI.captures(ua) {
            if has_safari {
                return Some(format!("Safari {}", &safari[1]));
            }
        }

        None
    }
}

impl DeviceLabeler for DeviceLabelService {
    /// Returns a friendly device label derived from the given User-Agent
    /// string, or "Unknown device" when the UA is missing or unrecognisable.
    fn describe(&self, user_agent: Option<&str>) -> String {
        let Some(ua) = user_agent.filter(|ua| !ua.is_empty()) else {
            return UNKNOWN_DEVICE.to_string();
        };

        if let Some(app) = Self::parse_mobile_app(ua) {
            return app;
        }

        match (Self::parse_os(ua), Self::parse_browser(ua)) {
            (Some(os), Some(browser)) => format!("{os} — {browser}"),
            (Some(os), None) => os,
            (None, Some(browser)) => browser,
            (None, None) => UNKNOWN_DEVICE.to_string(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn describe(user_agent: &str) -> String {
        DeviceLabelService::new().describe(Some(user_agent))
    }

    // ── the Trakwyn mobile app ──────────────────────────────────────────

    #[test]
    fn names_the_phone_from_the_user_agent_apps_mobile_sends() {
        assert_eq!(
            describe("TrakwynMobile/1.0.0 (iPhone 15 Pro; iOS 17.4)"),
            "iPhone 15 Pro — Trakwyn app"
        );
        assert_eq!(describe("TrakwynMobile/1.0.0 (Pixel 8; Android 14)"), "Pixel 8 — Trakwyn app");
    }

    #[test]
    fn falls_back_to_the_os_when_the_device_reports_no_model() {
        assert_eq!(describe("TrakwynMobile/1.0.0 (; iOS 17.4)"), "iOS 17.4 — Trakwyn app");
    }

    #[test]
    fn still_names_the_app_when_neither_is_known() {
        assert_eq!(describe("TrakwynMobile/1.0.0 (; )"), "Trakwyn app");
    }

    // What the sessions list showed for every phone before the app sent its own UA.
    #[test]
    fn does_not_recognise_the_http_clients_default_strings() {
        assert_eq!(describe("okhttp/4.12.0"), "Unknown device");
        assert_eq!(describe("Trakwyn/1 CFNetwork/1498.700.2 Darwin/23.6.0"), "Unknown device");
    }

    // ── browsers ────────────────────────────────────────────────────────

    #[test]
    fn labels_a_desktop_browser_by_os_and_browser() {
        assert_eq!(
            describe(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
            "Mac — Chrome 120.0.0.0"
        );
    }

    #[test]
    fn labels_an_android_browser_by_device_model() {
        assert_eq!(
            describe(
                "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A.230803.041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"
            ),
            "Android (Pixel 8) — Chrome 120.0.0.0"
        );
    }

    #[test]
    fn returns_unknown_device_for_a_missing_or_unrecognisable_user_agent() {
        let service = DeviceLabelService::new();
        assert_eq!(service.describe(None), "Unknown device");
        assert_eq!(service.describe(Some("")), "Unknown device");
        assert_eq!(describe("curl/8.4.0"), "Unknown device");
    }

    #[test]
    fn labels_each_operating_system() {
        for (ua, expected) in [
            ("Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Windows PC"),
            ("Mozilla/5.0 (Windows NT 6.1)", "Windows PC"),
            ("Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)", "Chromebook"),
            ("Mozilla/5.0 (Linux; Android 10; K)", "Android device"),
            ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)", "Mac"),
            ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_4)", "iPhone"),
            ("Mozilla/5.0 (iPad; CPU OS 17_4)", "iPad"),
            ("Mozilla/5.0 (X11; Linux x86_64)", "Linux device"),
        ] {
            assert_eq!(describe(ua), expected, "{ua}");
        }
    }

    #[test]
    fn labels_each_browser() {
        let windows =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)";
        for (suffix, expected) in [
            ("Chrome/120.0.0.0 Safari/537.36 Edg/120.0.2210.91", "Windows PC — Edge"),
            ("Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0", "Windows PC — Opera"),
            ("Chrome/120.0.0.0 Safari/537.36 Vivaldi/6.5", "Windows PC — Vivaldi"),
            ("Chrome/120.0.0.0 Safari/537.36 Brave/120", "Windows PC — Brave"),
            ("Chrome/120.0.0.0", "Windows PC — Chrome"),
            ("Gecko/20100101 Firefox/121.0", "Windows PC — Firefox 121.0"),
        ] {
            assert_eq!(describe(&format!("{windows} {suffix}")), expected, "{suffix}");
        }

        assert_eq!(describe("Opera/9.80 (X11; Linux x86_64) Presto/2.12"), "Linux device — Opera");
        assert_eq!(
            describe(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15"
            ),
            "Mac — Safari 17.4"
        );
    }

    #[test]
    fn a_browser_with_no_recognisable_os_is_labelled_by_the_browser_alone() {
        assert_eq!(describe("Mozilla/5.0 (Unknown) Gecko/20100101 Firefox/121.0"), "Firefox 121.0");
    }

    #[test]
    fn an_iphone_safari_is_labelled_mac_because_its_user_agent_says_mac_os_x() {
        // Ported as it stands: the "Mac OS X" check runs before the iPhone one.
        assert_eq!(
            describe(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1"
            ),
            "Mac — Safari 17.4"
        );
    }
}
