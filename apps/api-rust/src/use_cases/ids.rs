use std::sync::Arc;

/// Mints an entity id. Injected so a test can make ids predictable.
pub type GenerateId = Arc<dyn Fn() -> String + Send + Sync>;

/// The production generator: a 21-character nanoid, the same alphabet and
/// length `apps/api` writes, so rows from either implementation look alike.
pub fn nanoid_generator() -> GenerateId {
    Arc::new(|| nanoid::nanoid!())
}

const HEX: [char; 16] =
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'];
/// The values the variant nibble of an RFC 4122 UUID may take.
const UUID_VARIANT: [char; 4] = ['8', '9', 'a', 'b'];

/// A version-4 UUID, as `crypto.randomUUID()` prints it. `apps/api` mints
/// offer ids this way rather than as nanoids.
pub fn uuid_generator() -> GenerateId {
    Arc::new(|| {
        let random = nanoid::nanoid!(30, &HEX);
        let variant = nanoid::nanoid!(1, &UUID_VARIANT);
        format!(
            "{}-{}-4{}-{}{}-{}",
            &random[0..8],
            &random[8..12],
            &random[12..15],
            variant,
            &random[15..18],
            &random[18..30]
        )
    })
}

#[cfg(test)]
mod uuid_tests {
    use super::*;

    #[test]
    fn mints_distinct_version_4_uuids() {
        let generate = uuid_generator();
        let (a, b) = (generate(), generate());
        assert_ne!(a, b);
        for id in [a, b] {
            let groups: Vec<&str> = id.split('-').collect();
            let lengths: Vec<usize> = groups.iter().map(|group| group.len()).collect();
            assert_eq!(lengths, vec![8, 4, 4, 4, 12], "{id}");
            assert!(groups[2].starts_with('4'), "{id}");
            assert!(groups[3].starts_with(['8', '9', 'a', 'b']), "{id}");
            assert!(id.chars().all(|c| c == '-' || c.is_ascii_hexdigit()), "{id}");
        }
    }
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
