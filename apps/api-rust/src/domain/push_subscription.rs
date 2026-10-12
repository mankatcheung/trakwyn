use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum PushSubscriptionProvider {
    Web,
    Expo,
}

impl PushSubscriptionProvider {
    pub const ALL: [Self; 2] = [Self::Web, Self::Expo];

    /// The value stored in `PushSubscription.provider`.
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Web => "web",
            Self::Expo => "expo",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|provider| provider.as_str() == value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PushSubscription {
    pub id: String,
    pub user_id: String,
    pub provider: PushSubscriptionProvider,
    /// A web-push endpoint URL for `Web`; the Expo push token itself for `Expo`.
    pub endpoint: String,
    /// VAPID key material; `None` for `Expo` subscriptions.
    pub p256dh: Option<String>,
    pub auth: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provider_round_trips_through_its_stored_value() {
        for provider in PushSubscriptionProvider::ALL {
            assert_eq!(PushSubscriptionProvider::parse(provider.as_str()), Some(provider));
        }
    }

    #[test]
    fn an_unknown_provider_does_not_parse() {
        assert_eq!(PushSubscriptionProvider::parse("fcm"), None);
    }
}
