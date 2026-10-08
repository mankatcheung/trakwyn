//! Object storage settings (`STORAGE_PROVIDER`, `BLOB_PUBLIC_READ_WRITE_TOKEN`).

use super::{ConfigError, EnvLookup};

const STORAGE_PROVIDER_VERCEL_BLOB: &str = "vercel-blob";

/// `STORAGE_PROVIDER` values.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StorageProviderKind {
    /// Files under `uploads/` in the working directory, served by the API's
    /// own `/uploads/*` routes. A dev convenience.
    Local,
    VercelBlob,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StorageConfig {
    /// `vercel-blob` only when `STORAGE_PROVIDER` is exactly that; anything
    /// else, unset included, is local disk.
    pub provider: StorageProviderKind,
    /// The public-access Blob store's read-write token. Empty when unset:
    /// the Blob provider then refuses uploads and reads, and skips deletes.
    pub blob_public_read_write_token: String,
}

impl StorageConfig {
    pub fn from_lookup(get: EnvLookup<'_>) -> Result<Self, ConfigError> {
        let provider = match get("STORAGE_PROVIDER").as_deref() {
            Some(STORAGE_PROVIDER_VERCEL_BLOB) => StorageProviderKind::VercelBlob,
            _ => StorageProviderKind::Local,
        };

        Ok(Self {
            provider,
            blob_public_read_write_token: get("BLOB_PUBLIC_READ_WRITE_TOKEN").unwrap_or_default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn config(pairs: &[(&str, &str)]) -> StorageConfig {
        let map: HashMap<String, String> =
            pairs.iter().map(|(k, v)| (k.to_string(), v.to_string())).collect();
        StorageConfig::from_lookup(&|name| map.get(name).cloned()).unwrap()
    }

    #[test]
    fn defaults_to_local_disk_with_no_token() {
        assert_eq!(
            config(&[]),
            StorageConfig {
                provider: StorageProviderKind::Local,
                blob_public_read_write_token: String::new(),
            }
        );
    }

    #[test]
    fn selects_vercel_blob_and_reads_its_token() {
        let config = config(&[
            ("STORAGE_PROVIDER", "vercel-blob"),
            ("BLOB_PUBLIC_READ_WRITE_TOKEN", "vercel_blob_rw_store_secret"),
        ]);

        assert_eq!(config.provider, StorageProviderKind::VercelBlob);
        assert_eq!(config.blob_public_read_write_token, "vercel_blob_rw_store_secret");
    }

    #[test]
    fn an_unrecognised_provider_is_local() {
        assert_eq!(config(&[("STORAGE_PROVIDER", "s3")]).provider, StorageProviderKind::Local);
        assert_eq!(config(&[("STORAGE_PROVIDER", "local")]).provider, StorageProviderKind::Local);
    }

    #[test]
    fn ignores_the_unused_private_store_token() {
        let config = config(&[("BLOB_READ_WRITE_TOKEN", "unused")]);
        assert_eq!(config.blob_public_read_write_token, "");
    }
}
