//! Reading the request's cookies and writing the auth cookies.
//!
//! Access and refresh tokens are HttpOnly cookies for every browser client.
//! Every auth entry point sets or clears them through [`AuthCookies`], so the
//! attributes are decided in one place.

use std::collections::HashMap;

use percent_encoding::{percent_decode_str, utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};

use crate::config::Config;
use crate::http::constants::{cookie_max_age_s, cookies, COOKIE_PATH};

/// What `encodeURIComponent` leaves alone, which is how `@fastify/cookie`
/// encodes a value: both implementations must write the same bytes.
const COOKIE_VALUE: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

const EXPIRED: &str = "Thu, 01 Jan 1970 00:00:00 GMT";

/// The cookies a request carried, by name.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct RequestCookies(HashMap<String, String>);

impl RequestCookies {
    /// Parses a `Cookie` header. The first occurrence of a name wins, and a
    /// pair with no `=` is ignored.
    pub fn parse(header: &str) -> Self {
        let mut cookies = HashMap::new();
        for pair in header.split(';') {
            let Some((name, value)) = pair.split_once('=') else { continue };
            let value = value.trim().trim_matches('"');
            let decoded = percent_decode_str(value)
                .decode_utf8()
                .map(|decoded| decoded.into_owned())
                .unwrap_or_else(|_| value.to_string());
            cookies.entry(name.trim().to_string()).or_insert(decoded);
        }
        Self(cookies)
    }

    pub fn get(&self, name: &str) -> Option<&str> {
        self.0.get(name).map(String::as_str)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SameSite {
    Lax,
    None,
}

/// Builds the `Set-Cookie` values for signing in and out.
#[derive(Debug, Clone)]
pub struct AuthCookies {
    secure: bool,
    same_site: SameSite,
    domain: Option<String>,
}

impl AuthCookies {
    pub fn new(config: &Config) -> Self {
        let production = config.is_production();
        Self {
            secure: production,
            // The web app and API are on separate domains in production, so
            // the refresh cookie must be sent cross-site, which needs
            // `SameSite=None` and therefore `Secure`. Dev stays `Lax`: there
            // is no HTTPS to satisfy that.
            same_site: if production { SameSite::None } else { SameSite::Lax },
            domain: config.cookie_domain.clone(),
        }
    }

    fn set(&self, name: &str, value: &str, max_age_s: i64, http_only: bool) -> String {
        let mut cookie =
            format!("{name}={}; Max-Age={max_age_s}", utf8_percent_encode(value, COOKIE_VALUE));
        if let Some(domain) = &self.domain {
            cookie.push_str(&format!("; Domain={domain}"));
        }
        cookie.push_str(&format!("; Path={COOKIE_PATH}"));
        if http_only {
            cookie.push_str("; HttpOnly");
        }
        if self.secure {
            cookie.push_str("; Secure");
        }
        cookie.push_str(match self.same_site {
            SameSite::Lax => "; SameSite=Lax",
            SameSite::None => "; SameSite=None",
        });
        cookie
    }

    fn clear(name: &str, domain: Option<&str>) -> String {
        match domain {
            Some(domain) => {
                format!(
                    "{name}=; Max-Age=0; Domain={domain}; Path={COOKIE_PATH}; Expires={EXPIRED}"
                )
            }
            None => format!("{name}=; Max-Age=0; Path={COOKIE_PATH}; Expires={EXPIRED}"),
        }
    }

    /// A browser that signed in before `COOKIE_DOMAIN` was set may still hold
    /// host-only cookies. A domain-scoped `Set-Cookie` does not overwrite
    /// those (name, domain and path together are a cookie's identity), so
    /// both would be sent on every request. Clearing the host-only variant
    /// alongside every domain-scoped write lets a leftover heal itself.
    fn clear_legacy_host_only(&self) -> Vec<String> {
        if self.domain.is_none() {
            return Vec::new();
        }
        NAMES.iter().map(|name| Self::clear(name, None)).collect()
    }

    /// `Set-Cookie` values that start a session.
    pub fn sign_in(&self, access_token: &str, refresh_token: &str) -> Vec<String> {
        let mut values = vec![
            self.set(cookies::ACCESS_TOKEN, access_token, cookie_max_age_s::ACCESS_TOKEN, true),
            self.set(cookies::REFRESH_TOKEN, refresh_token, cookie_max_age_s::REFRESH_TOKEN, true),
            self.set(cookies::LOGGED_IN, "1", cookie_max_age_s::REFRESH_TOKEN, false),
        ];
        values.extend(self.clear_legacy_host_only());
        values
    }

    /// `Set-Cookie` values that end a session. The `Domain` must match the
    /// one the cookie was set with, or the browser clears a different cookie.
    pub fn sign_out(&self) -> Vec<String> {
        let mut values: Vec<String> =
            NAMES.iter().map(|name| Self::clear(name, self.domain.as_deref())).collect();
        values.extend(self.clear_legacy_host_only());
        values
    }
}

const NAMES: [&str; 3] = [cookies::ACCESS_TOKEN, cookies::REFRESH_TOKEN, cookies::LOGGED_IN];

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::NodeEnv;

    fn config(node_env: NodeEnv, cookie_domain: Option<&str>) -> Config {
        let base = Config::from_lookup(|name| match name {
            "DATABASE_URL" => Some("postgres://localhost/trakwyn".to_string()),
            "JWT_SECRET" => Some("a".to_string()),
            "JWT_REFRESH_SECRET" => Some("b".to_string()),
            _ => None,
        })
        .unwrap();
        Config { node_env, cookie_domain: cookie_domain.map(str::to_string), ..base }
    }

    #[test]
    fn parses_a_cookie_header() {
        let cookies = RequestCookies::parse("trakwyn_access_token=abc.def; theme=dark%20mode");

        assert_eq!(cookies.get("trakwyn_access_token"), Some("abc.def"));
        assert_eq!(cookies.get("theme"), Some("dark mode"));
        assert_eq!(cookies.get("missing"), None);
    }

    #[test]
    fn the_first_of_two_same_named_cookies_wins() {
        let cookies = RequestCookies::parse("a=1; a=2; malformed");
        assert_eq!(cookies.get("a"), Some("1"));
    }

    #[test]
    fn dev_cookies_are_lax_and_host_only() {
        let values = AuthCookies::new(&config(NodeEnv::Development, None)).sign_in("acc", "ref");

        assert_eq!(
            values,
            vec![
                "trakwyn_access_token=acc; Max-Age=900; Path=/; HttpOnly; SameSite=Lax",
                "trakwyn_refresh_token=ref; Max-Age=604800; Path=/; HttpOnly; SameSite=Lax",
                "trakwyn_logged_in=1; Max-Age=604800; Path=/; SameSite=Lax",
            ]
        );
    }

    #[test]
    fn production_cookies_are_cross_site_and_domain_scoped() {
        let auth = AuthCookies::new(&config(NodeEnv::Production, Some(".trakwyn.com")));
        let values = auth.sign_in("acc", "ref");

        assert_eq!(
            values[0],
            "trakwyn_access_token=acc; Max-Age=900; Domain=.trakwyn.com; Path=/; HttpOnly; Secure; SameSite=None"
        );
        // The hint cookie is readable by the web app's own script.
        assert!(!values[2].contains("HttpOnly"));
        // ...and each host-only leftover is cleared alongside.
        assert_eq!(values.len(), 6);
        assert_eq!(
            values[3],
            "trakwyn_access_token=; Max-Age=0; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
        );
    }

    #[test]
    fn signing_out_clears_with_the_domain_the_cookies_were_set_with() {
        let auth = AuthCookies::new(&config(NodeEnv::Production, Some(".trakwyn.com")));
        let values = auth.sign_out();

        assert_eq!(values.len(), 6);
        assert!(values[..3].iter().all(|value| value.contains("Domain=.trakwyn.com")));
        assert!(values[3..].iter().all(|value| !value.contains("Domain=")));
    }

    #[test]
    fn signing_out_without_a_domain_clears_each_cookie_once() {
        let values = AuthCookies::new(&config(NodeEnv::Development, None)).sign_out();
        assert_eq!(values.len(), 3);
    }

    #[test]
    fn encodes_a_value_the_way_encode_uri_component_does() {
        let auth = AuthCookies::new(&config(NodeEnv::Development, None));
        assert!(auth.set("n", "a b;c_d-e.f", 1, false).starts_with("n=a%20b%3Bc_d-e.f;"));
    }
}
