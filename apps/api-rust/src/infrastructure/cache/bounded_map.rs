use std::hash::Hash;

use super::constants::REVERSE_INDEX_MAX_ENTRIES;
use super::insertion_ordered::InsertionOrdered;

/// A map with a hard size cap. When an insert would exceed the cap, the
/// oldest entry (first inserted) is evicted, so memory stays bounded on a
/// long-lived instance.
///
/// Used for the cached repositories' reverse-index maps (id → owning user or
/// application), which otherwise grow with the number of distinct ids a
/// process has ever seen. An evicted id simply misses the list-cache bust on
/// the next delete or update for that id; the stale cache entry still expires
/// through the normal TTL.
///
/// FIFO eviction is intentional: these maps are only read to reverse-lookup
/// an owner, so recency tracking buys nothing over plain insertion order.
pub struct BoundedMap<K, V> {
    map: InsertionOrdered<K, V>,
    max_entries: usize,
}

impl<K: Hash + Eq + Clone, V> BoundedMap<K, V> {
    /// A cap below one entry is raised to one: a map that can hold nothing
    /// is never what a caller means.
    pub fn new(max_entries: usize) -> Self {
        Self { map: InsertionOrdered::new(), max_entries: max_entries.max(1) }
    }

    pub fn len(&self) -> usize {
        self.map.len()
    }

    pub fn is_empty(&self) -> bool {
        self.map.len() == 0
    }

    /// Overwriting an existing key keeps its place in the eviction order.
    pub fn set(&mut self, key: K, value: V) {
        self.map.insert(key, value);
        while self.map.len() > self.max_entries {
            if self.map.remove_oldest().is_none() {
                break;
            }
        }
    }

    pub fn get(&self, key: &K) -> Option<&V> {
        self.map.get(key)
    }

    /// True if the key was present.
    pub fn delete(&mut self, key: &K) -> bool {
        self.map.remove(key).is_some()
    }
}

impl<K: Hash + Eq + Clone, V> Default for BoundedMap<K, V> {
    fn default() -> Self {
        Self::new(REVERSE_INDEX_MAX_ENTRIES)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stores_and_retrieves_entries() {
        let mut map = BoundedMap::new(10);
        map.set("a", 1);
        assert_eq!(map.get(&"a"), Some(&1));
        assert_eq!(map.len(), 1);
        assert!(!map.is_empty());
    }

    #[test]
    fn evicts_the_oldest_entry_when_exceeding_the_cap() {
        let mut map = BoundedMap::new(2);
        map.set("a", 1);
        map.set("b", 2);
        map.set("c", 3);

        assert_eq!(map.len(), 2);
        assert_eq!(map.get(&"a"), None);
        assert_eq!(map.get(&"b"), Some(&2));
        assert_eq!(map.get(&"c"), Some(&3));
    }

    #[test]
    fn overwriting_a_key_updates_its_value_without_changing_eviction_order() {
        let mut map = BoundedMap::new(2);
        map.set("a", 1);
        map.set("b", 2);
        map.set("a", 10);
        assert_eq!(map.get(&"a"), Some(&10));

        // 'a' is still the oldest insert, so the next set evicts it.
        map.set("c", 3);

        assert_eq!(map.get(&"a"), None);
        assert_eq!(map.get(&"b"), Some(&2));
        assert_eq!(map.get(&"c"), Some(&3));
    }

    #[test]
    fn delete_removes_entries_and_frees_capacity_for_new_ones() {
        let mut map = BoundedMap::new(2);
        map.set("a", 1);
        map.set("b", 2);
        assert!(map.delete(&"a")); // frees a slot: 'c' fits without evicting 'b'
        assert!(!map.delete(&"a"));

        map.set("c", 3);
        map.set("d", 4); // over the cap again: evicts the oldest remaining entry, 'b'

        assert_eq!(map.len(), 2);
        assert_eq!(map.get(&"b"), None);
        assert_eq!(map.get(&"c"), Some(&3));
        assert_eq!(map.get(&"d"), Some(&4));
    }

    #[test]
    fn keeps_one_entry_when_the_cap_is_one() {
        let mut map = BoundedMap::new(1);
        map.set("a", 1);
        map.set("b", 2);
        assert_eq!(map.len(), 1);
        assert_eq!(map.get(&"b"), Some(&2));
    }

    #[test]
    fn raises_a_cap_below_one_to_one() {
        let mut map = BoundedMap::new(0);
        map.set("a", 1);
        map.set("b", 2);
        assert_eq!(map.len(), 1);
        assert_eq!(map.get(&"b"), Some(&2));
    }

    #[test]
    fn defaults_to_the_reverse_index_cap() {
        let map: BoundedMap<String, String> = BoundedMap::default();
        assert_eq!(map.max_entries, REVERSE_INDEX_MAX_ENTRIES);
        assert!(map.is_empty());
    }
}
