use std::sync::Arc;

/// Mints an entity id. Injected so a test can make ids predictable.
pub type GenerateId = Arc<dyn Fn() -> String + Send + Sync>;

/// The production generator: a 21-character nanoid, the same alphabet and
/// length `apps/api` writes, so rows from either implementation look alike.
pub fn nanoid_generator() -> GenerateId {
    Arc::new(|| nanoid::nanoid!())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mints_distinct_21_character_ids() {
        let generate = nanoid_generator();
        let (a, b) = (generate(), generate());
        assert_eq!(a.len(), 21);
        assert_ne!(a, b);
    }
}
