use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use async_trait::async_trait;

use crate::use_cases::constants::token_lifetime_s;
use crate::use_cases::ports::SessionBlocklist;

/// How long a revoked session id stays blocklisted: the access token's own
/// lifetime. Past that, every access token the session issued has expired,
/// so the entry has nothing left to block.
const TTL: Duration = Duration::from_secs(token_lifetime_s::ACCESS_TOKEN as u64);

/// Upper bound on held entries, so a burst of revocations cannot grow the map
/// without limit.
const MAX_ENTRIES: usize = 10_000;

/// In-process blocklist for local dev, tests and single-instance deployments.
/// Entries are not shared across instances and are lost on restart, which is
/// why a multi-instance deployment needs a shared store instead.
pub struct MemorySessionBlocklist {
    /// Session id → the instant its entry stops mattering.
    entries: Mutex<HashMap<String, Instant>>,
    ttl: Duration,
    max_entries: usize,
}

impl Default for MemorySessionBlocklist {
    fn default() -> Self {
        Self::new(TTL, MAX_ENTRIES)
    }
}

impl MemorySessionBlocklist {
    pub fn new(ttl: Duration, max_entries: usize) -> Self {
        Self { entries: Mutex::new(HashMap::new()), ttl, max_entries }
    }
}

/// Makes room for one more entry: expired ones go first, then the one closest
/// to expiring, which is the one with the least left to block.
fn make_room(entries: &mut HashMap<String, Instant>, max_entries: usize, now: Instant) {
    if entries.len() < max_entries {
        return;
    }
    entries.retain(|_, expires_at| *expires_at > now);
    while entries.len() >= max_entries {
        let Some(soonest) =
            entries.iter().min_by_key(|(_, expires_at)| **expires_at).map(|(id, _)| id.clone())
        else {
            return;
        };
        entries.remove(&soonest);
    }
}

#[async_trait]
impl SessionBlocklist for MemorySessionBlocklist {
    async fn revoke(&self, session_id: &str) {
        let now = Instant::now();
        // A poisoned lock means another thread panicked mid-update; the map
        // is still a valid map, and failing open is this port's contract.
        let mut entries = self.entries.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        make_room(&mut entries, self.max_entries, now);
        entries.insert(session_id.to_string(), now + self.ttl);
    }

    async fn is_revoked(&self, session_id: &str) -> bool {
        let now = Instant::now();
        let mut entries = self.entries.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        match entries.get(session_id) {
            None => false,
            Some(expires_at) if *expires_at > now => true,
            // Lazy expiry: there is no timer, and an entry past its TTL is
            // equivalent to an absent one.
            Some(_) => {
                entries.remove(session_id);
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn reports_a_revoked_session() {
        let blocklist = MemorySessionBlocklist::default();
        blocklist.revoke("sid-1").await;

        assert!(blocklist.is_revoked("sid-1").await);
        assert!(!blocklist.is_revoked("sid-2").await);
    }

    #[tokio::test]
    async fn forgets_an_entry_once_its_ttl_has_passed() {
        let blocklist = MemorySessionBlocklist::new(Duration::ZERO, 10);
        blocklist.revoke("sid-1").await;

        assert!(!blocklist.is_revoked("sid-1").await);
        assert!(blocklist.entries.lock().unwrap().is_empty());
    }

    #[tokio::test]
    async fn evicts_the_entry_closest_to_expiry_when_full() {
        let blocklist = MemorySessionBlocklist::new(Duration::from_secs(60), 2);
        blocklist.revoke("oldest").await;
        blocklist.revoke("middle").await;
        blocklist.revoke("newest").await;

        assert!(!blocklist.is_revoked("oldest").await);
        assert!(blocklist.is_revoked("middle").await);
        assert!(blocklist.is_revoked("newest").await);
    }
}
