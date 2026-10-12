//! Cache tuning, shared by `MemoryCache`, `RedisCache` and the repository
//! decorators that sit on top of them.

use std::time::Duration;

/// How long an entry lives when the caller does not say.
pub const DEFAULT_TTL: Duration = Duration::from_secs(5 * 60);

/// `MemoryCache` (local dev and tests) hard cap on live entries: exceeding it
/// evicts the least-recently-used entry, so a long-lived instance never grows
/// unbounded. Production uses `RedisCache`, which bounds its own memory
/// through Redis eviction.
pub const MEMORY_MAX_ENTRIES: usize = 10_000;

/// Cap on each cached repository's reverse-index map (id → owner), so the
/// mappings used to bust list caches on delete and update do not grow with
/// every distinct id seen. An evicted id just misses the list-cache bust for
/// that delete; the stale entry still expires through the normal TTL.
pub const REVERSE_INDEX_MAX_ENTRIES: usize = 10_000;

/// Stampede protection (`RedisCache`): how long a populate-lock is held
/// before it expires on its own, which covers a crash mid-fetch.
pub const STAMPEDE_LOCK_TTL: Duration = Duration::from_millis(10_000);
/// How often a concurrent miss polls for the lock-holder's result.
pub const STAMPEDE_POLL_INTERVAL: Duration = Duration::from_millis(50);
/// How many times it polls (about a second) before fetching directly itself.
pub const STAMPEDE_MAX_POLL_ATTEMPTS: u32 = 20;

/// Circuit breaker: consecutive failures before further calls are
/// short-circuited.
pub const CIRCUIT_FAILURE_THRESHOLD: u32 = 5;
/// How long the breaker stays open before letting one trial call through to
/// check whether Redis has recovered.
pub const CIRCUIT_COOLDOWN: Duration = Duration::from_millis(30_000);

/// Bearer credentials are cached far more briefly than the default. A cached
/// row carries its own `revokedAt`, so revocation is only dangerous in the
/// gap between the database write and the cache delete: this is the ceiling
/// on that gap if the delete is ever missed, not the mechanism that closes it.
pub const TOKEN_TTL: Duration = Duration::from_secs(60);

/// How long between writes of a token's `lastUsedAt`. It feeds a "last used"
/// column in settings, where a minute of granularity is indistinguishable
/// from none.
pub const TOKEN_LAST_USED_TTL: Duration = Duration::from_secs(60);
