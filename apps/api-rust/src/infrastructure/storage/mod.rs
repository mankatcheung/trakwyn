//! Object storage: local disk for dev, Vercel Blob in production.

mod http_remote_file_fetcher;
mod local_storage_provider;
mod vercel_blob_storage_provider;

pub use http_remote_file_fetcher::HttpRemoteFileFetcher;
pub use local_storage_provider::{LocalStorageProvider, LocalStoredObject};
pub use vercel_blob_storage_provider::{
    BlobRetry, VercelBlobError, VercelBlobStorageProvider, VERCEL_BLOB_API_URL,
};
