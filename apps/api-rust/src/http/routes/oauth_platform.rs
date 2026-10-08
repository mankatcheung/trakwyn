//! Which client started an OAuth login, and where it is handed back
//! (`apps/api`'s `oauthPlatform.ts`).

use std::collections::BTreeSet;

use axum::http::header::HOST;
use axum::http::HeaderMap;

use crate::http::constants::oauth_sign_in::{self as oauth, platform};
use crate::infrastructure::auth::extension_redirect_url;

const FORWARDED_PROTO: &str = "x-forwarded-proto";
/// Used when the request carries no `Host` header.
const FALLBACK_HOST: &str = "localhost:3001";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OAuthPlatform {
    Web,
    Mobile,
    Extension,
    ExtensionTab,
}

impl OAuthPlatform {
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Web => platform::WEB,
            Self::Mobile => platform::MOBILE,
            Self::Extension => platform::EXTENSION,
            Self::ExtensionTab => platform::EXTENSION_TAB,
        }
    }

    /// Anything unrecognised, or absent, is web.
    pub fn parse(value: Option<&str>) -> Self {
        match value {
            Some(platform::MOBILE) => Self::Mobile,
            Some(platform::EXTENSION) => Self::Extension,
            Some(platform::EXTENSION_TAB) => Self::ExtensionTab,
            _ => Self::Web,
        }
    }
}

/// This API's own origin, as the request reached it. The protocol is
/// `X-Forwarded-Proto`'s first value (Fastify's `trustProxy`), else `http`.
pub fn request_origin(headers: &HeaderMap) -> String {
    let protocol = headers
        .get(FORWARDED_PROTO)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("http");
    let host = headers.get(HOST).and_then(|value| value.to_str().ok()).unwrap_or(FALLBACK_HOST);
    format!("{protocol}://{host}")
}

/// Where a non-web login is handed its tokens; `None` means web, which gets
/// cookies instead.
///
/// - mobile: the app's deep link
/// - extension: its `chromiumapp.org` URL (JEF-383)
/// - extension in a tab: this API's own done page (Safari, JEF-386)
///
/// The extension ID is checked against the allowlist again here, not only at
/// `/start`, so the redirect host never rests on the cookie alone.
pub fn handoff_redirect_base(
    platform: OAuthPlatform,
    extension_id: &str,
    allowed_extension_ids: &BTreeSet<String>,
    api_origin: &str,
) -> Option<String> {
    match platform {
        OAuthPlatform::Mobile => Some(oauth::MOBILE_CALLBACK.to_string()),
        OAuthPlatform::Extension if allowed_extension_ids.contains(extension_id) => {
            Some(extension_redirect_url(extension_id))
        }
        OAuthPlatform::ExtensionTab => Some(format!("{api_origin}{}", oauth::EXTENSION_DONE)),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderValue;

    const ID: &str = "abcdefghijklmnopabcdefghijklmnop";

    fn allowed() -> BTreeSet<String> {
        BTreeSet::from([ID.to_string()])
    }

    #[test]
    fn parses_the_known_platforms_and_defaults_to_web() {
        assert_eq!(OAuthPlatform::parse(Some("mobile")), OAuthPlatform::Mobile);
        assert_eq!(OAuthPlatform::parse(Some("extension")), OAuthPlatform::Extension);
        assert_eq!(OAuthPlatform::parse(Some("extension-tab")), OAuthPlatform::ExtensionTab);
        assert_eq!(OAuthPlatform::parse(Some("desktop")), OAuthPlatform::Web);
        assert_eq!(OAuthPlatform::parse(None), OAuthPlatform::Web);
    }

    #[test]
    fn hands_each_platform_back_to_its_own_target() {
        let api = "https://api.example.com";
        assert_eq!(
            handoff_redirect_base(OAuthPlatform::Mobile, "", &allowed(), api).as_deref(),
            Some("trakwyn://oauth-callback")
        );
        assert_eq!(
            handoff_redirect_base(OAuthPlatform::Extension, ID, &allowed(), api).as_deref(),
            Some("https://abcdefghijklmnopabcdefghijklmnop.chromiumapp.org/")
        );
        assert_eq!(
            handoff_redirect_base(OAuthPlatform::ExtensionTab, "", &allowed(), api).as_deref(),
            Some("https://api.example.com/auth/oauth/extension/done")
        );
        assert_eq!(handoff_redirect_base(OAuthPlatform::Web, "", &allowed(), api), None);
    }

    #[test]
    fn an_extension_outside_the_allowlist_gets_no_handoff() {
        assert_eq!(handoff_redirect_base(OAuthPlatform::Extension, "evil", &allowed(), "x"), None);
        assert_eq!(
            handoff_redirect_base(OAuthPlatform::Extension, ID, &BTreeSet::new(), "x"),
            None
        );
    }

    #[test]
    fn the_origin_uses_the_forwarded_protocol_and_host() {
        let mut headers = HeaderMap::new();
        headers.insert(HOST, HeaderValue::from_static("api.example.com"));
        assert_eq!(request_origin(&headers), "http://api.example.com");
        headers.insert(FORWARDED_PROTO, HeaderValue::from_static("https, http"));
        assert_eq!(request_origin(&headers), "https://api.example.com");
    }
}
