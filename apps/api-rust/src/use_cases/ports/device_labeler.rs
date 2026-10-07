/// Parses a raw User-Agent string into a human-readable device label.
pub trait DeviceLabeler: Send + Sync {
    /// Returns a friendly device label, or "Unknown device" when unrecognisable.
    fn describe(&self, user_agent: Option<&str>) -> String;
}
