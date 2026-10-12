use std::collections::{BTreeMap, HashMap};
use std::hash::Hash;

/// A map that remembers the order its keys were first inserted in, like a
/// JavaScript `Map`: overwriting a key keeps its place, and removing then
/// re-inserting it moves it to the back.
pub(crate) struct InsertionOrdered<K, V> {
    entries: HashMap<K, (u64, V)>,
    order: BTreeMap<u64, K>,
    next_position: u64,
}

impl<K: Hash + Eq + Clone, V> InsertionOrdered<K, V> {
    pub(crate) fn new() -> Self {
        Self { entries: HashMap::new(), order: BTreeMap::new(), next_position: 0 }
    }

    pub(crate) fn len(&self) -> usize {
        self.entries.len()
    }

    pub(crate) fn get(&self, key: &K) -> Option<&V> {
        self.entries.get(key).map(|(_, value)| value)
    }

    pub(crate) fn insert(&mut self, key: K, value: V) {
        if let Some(entry) = self.entries.get_mut(&key) {
            entry.1 = value;
            return;
        }
        let position = self.next_position;
        self.next_position += 1;
        self.order.insert(position, key.clone());
        self.entries.insert(key, (position, value));
    }

    pub(crate) fn remove(&mut self, key: &K) -> Option<V> {
        let (position, value) = self.entries.remove(key)?;
        self.order.remove(&position);
        Some(value)
    }

    /// Makes `key` the most recently inserted one.
    pub(crate) fn move_to_back(&mut self, key: &K) {
        if let Some(value) = self.remove(key) {
            self.insert(key.clone(), value);
        }
    }

    pub(crate) fn remove_oldest(&mut self) -> Option<(K, V)> {
        let (_, key) = self.order.pop_first()?;
        let (_, value) = self.entries.remove(&key)?;
        Some((key, value))
    }

    /// Keys, oldest first.
    pub(crate) fn keys(&self) -> impl Iterator<Item = &K> {
        self.order.values()
    }

    pub(crate) fn clear(&mut self) {
        self.entries.clear();
        self.order.clear();
    }
}
