use std::collections::HashMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::ports::{DeviceLabeler, IpLocationResolver};

/// Labels a device `"Device(<user agent>)"`, or `"Unknown device"` without
/// one, so a test can tell which User-Agent a label came from.
#[derive(Default)]
pub struct FakeDeviceLabeler;

impl DeviceLabeler for FakeDeviceLabeler {
    fn describe(&self, user_agent: Option<&str>) -> String {
        match user_agent {
            Some(user_agent) if !user_agent.is_empty() => format!("Device({user_agent})"),
            _ => "Unknown device".to_string(),
        }
    }
}

/// Knows only the addresses it was given, and remembers what it was asked.
#[derive(Default)]
pub struct FakeIpLocationResolver {
    locations: HashMap<String, String>,
    lookups: Mutex<Vec<Option<String>>>,
}

impl FakeIpLocationResolver {
    pub fn with_location(mut self, ip_address: &str, location: &str) -> Self {
        self.locations.insert(ip_address.to_string(), location.to_string());
        self
    }

    /// Every address looked up so far, in order.
    pub fn lookups(&self) -> Vec<Option<String>> {
        self.lookups.lock().unwrap().clone()
    }
}

#[async_trait]
impl IpLocationResolver for FakeIpLocationResolver {
    async fn lookup(&self, ip_address: Option<&str>) -> Option<String> {
        self.lookups.lock().unwrap().push(ip_address.map(str::to_string));
        self.locations.get(ip_address?).cloned()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn labels_a_device_by_its_user_agent() {
        let labeler = FakeDeviceLabeler;

        assert_eq!(labeler.describe(Some("curl/8.4.0")), "Device(curl/8.4.0)");
        assert_eq!(labeler.describe(Some("")), "Unknown device");
        assert_eq!(labeler.describe(None), "Unknown device");
    }

    #[tokio::test]
    async fn resolves_only_the_addresses_it_was_given() {
        let resolver = FakeIpLocationResolver::default().with_location("203.0.113.4", "London, GB");

        assert_eq!(resolver.lookup(Some("203.0.113.4")).await.as_deref(), Some("London, GB"));
        assert_eq!(resolver.lookup(Some("8.8.8.8")).await, None);
        assert_eq!(resolver.lookup(None).await, None);
        assert_eq!(
            resolver.lookups(),
            vec![Some("203.0.113.4".to_string()), Some("8.8.8.8".to_string()), None]
        );
    }
}
