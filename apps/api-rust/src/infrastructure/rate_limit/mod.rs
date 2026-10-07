//! Fixed-window rate limiters: in-process for dev and tests, Redis-backed in
//! production, and a decorator that makes every rejection observable.

mod instrumented;
mod memory;
mod redis;

pub use instrumented::{describe_rate_limit_key, InstrumentedRateLimiter};
pub use memory::MemoryRateLimiter;
pub use redis::RedisRateLimiter;
