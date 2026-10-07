use async_trait::async_trait;

/// Resolves an IP address to a coarse-grained geographic location string.
#[async_trait]
pub trait IpLocationResolver: Send + Sync {
    /// Best-effort location string, e.g. "San Jose, United States".
    /// Returns `None` when the lookup fails or the IP is private/unresolvable.
    async fn lookup(&self, ip_address: Option<&str>) -> Option<String>;
}
