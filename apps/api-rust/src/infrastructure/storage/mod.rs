//! Object storage: local disk for dev, Vercel Blob in production.

mod local_storage_provider;
mod vercel_blob_storage_provider;

pub use local_storage_provider::{LocalStorageProvider, LocalStoredObject};
pub use vercel_blob_storage_provider::{
    BlobRetry, VercelBlobError, VercelBlobStorageProvider, VERCEL_BLOB_API_URL,
};
