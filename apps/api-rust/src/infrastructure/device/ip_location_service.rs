use std::time::Duration;

use async_trait::async_trait;

use crate::use_cases::ports::IpLocationResolver;

/// ip-api.com's free JSON endpoint (no API key, 45 requests a minute): what
/// production passes as `api_url`. The free tier is served over plain http.
pub const IP_LOCATION_API_URL: &str = "http://ip-api.com/json";

const TIMEOUT: Duration = Duration::from_millis(2_000);

/// Resolves an IP address to a coarse-grained geographic location (city,
/// country).
///
/// Returns `None` when:
///  - the IP is private/loopback (e.g. `127.0.0.1`, `192.168.x.x`)
///  - the lookup fails or times out
///  - the response contains no usable city/country data
pub struct IpLocationService {
    client: reqwest::Client,
    api_url: String,
    timeout: Duration,
}

impl IpLocationService {
    /// `api_url` is [`IP_LOCATION_API_URL`] outside tests.
    pub fn new(client: reqwest::Client, api_url: impl Into<String>) -> Self {
        Self { client, api_url: api_url.into(), timeout: TIMEOUT }
    }

    /// Gives up on a lookup after `timeout` instead of the default two seconds.
    pub fn with_timeout(mut self, timeout: Duration) -> Self {
        self.timeout = timeout;
        self
    }

    /// True for private, loopback and link-local addresses, judged by prefix
    /// as `apps/api` does (so all of `172.*` counts, not only `172.16/12`).
    fn is_private(ip: &str) -> bool {
        ip == "127.0.0.1"
            || ip == "::1"
            || ip.starts_with("10.")
            || ip.starts_with("192.168.")
            || ip.starts_with("172.")
            || ip.starts_with("169.254.")
    }

    async fn fetch(&self, ip_address: &str) -> Option<String> {
        let response = self
            .client
            .get(format!("{}/{ip_address}", self.api_url))
            .timeout(self.timeout)
            .send()
            .await
            .ok()?;
        if !response.status().is_success() {
            return None;
        }

        let data: serde_json::Value = response.json().await.ok()?;
        if data.get("status")?.as_str()? != "success" {
            return None;
        }

        let parts: Vec<&str> = ["city", "country"]
            .into_iter()
            .filter_map(|field| data.get(field)?.as_str())
            .filter(|part| !part.is_empty())
            .collect();
        (!parts.is_empty()).then(|| parts.join(", "))
    }
}

#[async_trait]
impl IpLocationResolver for IpLocationService {
    /// Best-effort location string, e.g. "San Jose, United States".
    /// Returns `None` on any failure so the caller can degrade gracefully.
    async fn lookup(&self, ip_address: Option<&str>) -> Option<String> {
        let ip_address = ip_address.filter(|ip| !ip.is_empty())?;
        if Self::is_private(ip_address) {
            return None;
        }
        self.fetch(ip_address).await
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::*;
    use crate::infrastructure::net::stub_server::{unreachable_base_url, StubResponse, StubServer};

    fn service(server: &StubServer) -> IpLocationService {
        IpLocationService::new(reqwest::Client::new(), format!("{}/json", server.base_url))
    }

    async fn answering(body: serde_json::Value) -> StubServer {
        StubServer::answering(200, body.to_string()).await
    }

    #[test]
    fn the_production_endpoint_is_ip_api() {
        assert_eq!(IP_LOCATION_API_URL, "http://ip-api.com/json");
    }

    #[tokio::test]
    async fn asks_for_the_address_and_joins_city_and_country() {
        let server = answering(
            json!({ "status": "success", "city": "San Jose", "country": "United States" }),
        )
        .await;

        let location = service(&server).lookup(Some("203.0.113.4")).await;

        assert_eq!(location.as_deref(), Some("San Jose, United States"));
        let request = server.single_request();
        assert_eq!(request.method, "GET");
        assert_eq!(request.path, "/json/203.0.113.4");
        assert_eq!(request.query, None);
    }

    #[tokio::test]
    async fn uses_whichever_of_city_and_country_is_present() {
        for (body, expected) in [
            (json!({ "status": "success", "country": "Japan" }), Some("Japan")),
            (json!({ "status": "success", "city": "Tokyo", "country": "" }), Some("Tokyo")),
            (json!({ "status": "success", "city": "", "country": "" }), None),
            (json!({ "status": "success" }), None),
        ] {
            let server = answering(body.clone()).await;
            assert_eq!(
                service(&server).lookup(Some("8.8.8.8")).await.as_deref(),
                expected,
                "{body}"
            );
        }
    }

    #[tokio::test]
    async fn never_asks_about_a_missing_or_private_address() {
        let server = answering(json!({ "status": "success", "city": "Nowhere" })).await;
        let service = service(&server);

        assert_eq!(service.lookup(None).await, None);
        for ip in [
            "",
            "127.0.0.1",
            "::1",
            "10.1.2.3",
            "192.168.1.1",
            "172.16.0.1",
            "172.32.0.1",
            "169.254.169.254",
        ] {
            assert_eq!(service.lookup(Some(ip)).await, None, "{ip}");
        }
        assert!(server.requests().is_empty());
    }

    #[tokio::test]
    async fn returns_none_when_the_lookup_is_refused_or_reports_failure() {
        for response in [
            StubResponse::new(429, ""),
            StubResponse::new(500, json!({ "status": "success", "city": "X" }).to_string()),
            StubResponse::json(200, json!({ "status": "fail", "message": "reserved range" })),
            StubResponse::json(200, json!({ "city": "X" })),
            StubResponse::new(200, "not json"),
        ] {
            let server = StubServer::start(vec![response.clone()]).await;
            assert_eq!(service(&server).lookup(Some("8.8.8.8")).await, None, "{response:?}");
        }
    }

    #[tokio::test]
    async fn returns_none_when_the_service_cannot_be_reached() {
        let service = IpLocationService::new(reqwest::Client::new(), unreachable_base_url().await);

        assert_eq!(service.lookup(Some("8.8.8.8")).await, None);
    }

    #[tokio::test]
    async fn gives_up_when_the_answer_takes_too_long() {
        let slow = StubResponse::json(200, json!({ "status": "success", "city": "Slow" }))
            .delayed(Duration::from_millis(500));
        let server = StubServer::start(vec![slow]).await;

        let location =
            service(&server).with_timeout(Duration::from_millis(50)).lookup(Some("8.8.8.8")).await;

        assert_eq!(location, None);
    }
}
