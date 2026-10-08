pub mod send_weekly_digest;

pub use send_weekly_digest::{DigestSummary, SendWeeklyDigestUseCase};

#[cfg(test)]
mod tests;
