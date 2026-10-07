use std::collections::BTreeMap;
use std::sync::Mutex;

use async_trait::async_trait;

use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::StorageProvider;

/// One object held by a [`FakeStorageProvider`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredObject {
    pub data: Vec<u8>,
    pub mime_type: String,
}

/// Keeps objects in memory. URLs are recognisable strings built from the
/// key (`fake-upload://<key>`, `fake-storage://<key>`), handed out whether
/// or not the object exists, as the local provider does.
#[derive(Default)]
pub struct FakeStorageProvider {
    objects: Mutex<BTreeMap<String, StoredObject>>,
}

impl FakeStorageProvider {
    /// A store already holding an object at each key.
    pub fn with_objects(keys: &[&str]) -> Self {
        let storage = Self::default();
        for key in keys {
            storage.insert(key, b"", "application/octet-stream");
        }
        storage
    }

    /// Stores an object as a completed direct upload would.
    pub fn insert(&self, key: &str, data: &[u8], mime_type: &str) {
        self.objects.lock().unwrap().insert(
            key.to_string(),
            StoredObject { data: data.to_vec(), mime_type: mime_type.to_string() },
        );
    }

    pub fn object(&self, key: &str) -> Option<StoredObject> {
        self.objects.lock().unwrap().get(key).cloned()
    }

    pub fn contains(&self, key: &str) -> bool {
        self.objects.lock().unwrap().contains_key(key)
    }

    /// Every stored key, sorted.
    pub fn keys(&self) -> Vec<String> {
        self.objects.lock().unwrap().keys().cloned().collect()
    }
}

#[async_trait]
impl StorageProvider for FakeStorageProvider {
    async fn get_presigned_upload_url(
        &self,
        key: &str,
        _mime_type: &str,
        _ttl_seconds: Option<u64>,
    ) -> DomainResult<String> {
        Ok(format!("fake-upload://{key}"))
    }

    async fn get_signed_url(&self, key: &str, _ttl_seconds: Option<u64>) -> DomainResult<String> {
        Ok(format!("fake-storage://{key}"))
    }

    async fn put_object(&self, key: &str, data: &[u8], mime_type: &str) -> DomainResult<()> {
        self.insert(key, data, mime_type);
        Ok(())
    }

    async fn delete(&self, key: &str) -> DomainResult<()> {
        self.objects.lock().unwrap().remove(key);
        Ok(())
    }

    async fn delete_many(&self, keys: &[String]) -> DomainResult<()> {
        let mut objects = self.objects.lock().unwrap();
        for key in keys {
            objects.remove(key);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn stores_replaces_and_deletes_objects() {
        let storage = FakeStorageProvider::default();

        storage.put_object("a/one.pdf", b"first", "application/pdf").await.unwrap();
        storage.put_object("a/one.pdf", b"second", "application/pdf").await.unwrap();
        storage.put_object("b/two.txt", b"two", "text/plain").await.unwrap();

        assert_eq!(
            storage.object("a/one.pdf"),
            Some(StoredObject {
                data: b"second".to_vec(),
                mime_type: "application/pdf".to_string()
            })
        );
        assert_eq!(storage.keys(), vec!["a/one.pdf", "b/two.txt"]);

        storage.delete("a/one.pdf").await.unwrap();
        storage.delete("a/one.pdf").await.unwrap();
        assert!(!storage.contains("a/one.pdf"));
        assert!(storage.contains("b/two.txt"));
    }

    #[tokio::test]
    async fn delete_many_removes_the_keys_that_exist_and_ignores_the_rest() {
        let storage = FakeStorageProvider::with_objects(&["a", "b", "c"]);

        storage
            .delete_many(&["a".to_string(), "missing".to_string(), "c".to_string()])
            .await
            .unwrap();

        assert_eq!(storage.keys(), vec!["b"]);
    }

    #[tokio::test]
    async fn hands_out_urls_built_from_the_key() {
        let storage = FakeStorageProvider::default();

        assert_eq!(
            storage
                .get_presigned_upload_url("users/u1/cv.pdf", "application/pdf", None)
                .await
                .unwrap(),
            "fake-upload://users/u1/cv.pdf"
        );
        assert_eq!(
            storage.get_signed_url("users/u1/cv.pdf", Some(60)).await.unwrap(),
            "fake-storage://users/u1/cv.pdf"
        );
        assert!(storage.keys().is_empty());
    }
}
