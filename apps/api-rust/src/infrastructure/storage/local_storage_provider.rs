use std::io;
use std::path::{Path, PathBuf};

use async_trait::async_trait;
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use tokio::fs;

use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::StorageProvider;

/// The directory under the working directory that holds the files.
const UPLOAD_DIR_NAME: &str = "uploads";
const FALLBACK_MIME: &str = "application/octet-stream";

/// Everything JavaScript's `encodeURIComponent` escapes: all but
/// `A-Z a-z 0-9 - _ . ! ~ * ' ( )`.
const URI_COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'_')
    .remove(b'.')
    .remove(b'!')
    .remove(b'~')
    .remove(b'*')
    .remove(b'\'')
    .remove(b'(')
    .remove(b')');

/// Extension → Content-Type for files served back by `open_object`.
fn mime_for_extension(extension: &str) -> Option<&'static str> {
    Some(match extension {
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "odt" => "application/vnd.oasis.opendocument.text",
        "rtf" => "application/rtf",
        "txt" => "text/plain; charset=utf-8",
        "md" => "text/markdown; charset=utf-8",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        _ => return None,
    })
}

fn is_missing_file_error(error: &io::Error) -> bool {
    matches!(error.kind(), io::ErrorKind::NotFound | io::ErrorKind::NotADirectory)
}

/// Collapses `.`, `..` and repeated separators in an absolute `/` path
/// without touching the filesystem, as Node's `path.normalize` does. `..` at
/// the root stays at the root.
fn normalize(path: &str) -> String {
    let mut segments: Vec<&str> = Vec::new();
    for segment in path.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                segments.pop();
            }
            segment => segments.push(segment),
        }
    }
    format!("/{}", segments.join("/"))
}

/// A stored file opened for reading.
#[derive(Debug)]
pub struct LocalStoredObject {
    pub file: fs::File,
    pub size: u64,
    pub content_type: &'static str,
}

/// Keeps objects as files under an upload directory and hands out URLs the
/// API itself serves (`/uploads/*`, `/uploads/_upload/*`). A dev convenience.
///
/// Only `resolve_key_path` and `open_object` refuse a key that leaves the
/// upload directory. The port methods join the key as given, as `apps/api`
/// does: their callers validate the key first.
pub struct LocalStorageProvider {
    /// Absolute and normalized, with no trailing separator.
    upload_dir: String,
    base_url: String,
}

impl LocalStorageProvider {
    /// Stores under `upload_dir`, which must be absolute, and hands out URLs
    /// on `http://localhost:<port>/uploads`; `port` is the one the API
    /// listens on.
    pub fn new(upload_dir: impl AsRef<Path>, port: u16) -> Self {
        Self {
            upload_dir: normalize(&upload_dir.as_ref().to_string_lossy()),
            base_url: format!("http://localhost:{port}/{UPLOAD_DIR_NAME}"),
        }
    }

    /// `uploads/` under the process's working directory: where `apps/api`
    /// keeps them.
    pub fn default_upload_dir() -> io::Result<PathBuf> {
        Ok(std::env::current_dir()?.join(UPLOAD_DIR_NAME))
    }

    /// Where a key lands when it is joined to the upload dir without being
    /// checked: a leading `/` does not escape, `..` does.
    fn joined_path(&self, key: &str) -> PathBuf {
        PathBuf::from(normalize(&format!("{}/{key}", self.upload_dir)))
    }

    async fn create_parent_dir(path: &Path) -> io::Result<()> {
        match path.parent() {
            Some(parent) => fs::create_dir_all(parent).await,
            None => Ok(()),
        }
    }

    /// The absolute path a key maps to, or `None` when the key would land
    /// outside the upload dir (`..` segments, an absolute path, a NUL byte).
    /// Checked by resolving rather than by pattern, so an oddly shaped
    /// traversal is caught the same way as a literal `../`.
    pub fn resolve_key_path(&self, key: &str) -> Option<PathBuf> {
        if key.is_empty() || key.contains('\0') || key.split(['\\', '/']).any(|part| part == "..") {
            return None;
        }
        let file_path = if key.starts_with('/') {
            normalize(key)
        } else {
            normalize(&format!("{}/{key}", self.upload_dir))
        };
        file_path.starts_with(&format!("{}/", self.upload_dir)).then(|| PathBuf::from(file_path))
    }

    /// Opens a stored file for reading: the counterpart of the URL
    /// `get_signed_url` hands out, served by the dev-only `GET /uploads/*`
    /// route. Not on `StorageProvider`: Vercel Blob serves its own URLs, so
    /// nothing above infrastructure needs to read an object back. Returns
    /// `None` for a key that is invalid or names no file.
    pub async fn open_object(&self, key: &str) -> DomainResult<Option<LocalStoredObject>> {
        let Some(file_path) = self.resolve_key_path(key) else {
            return Ok(None);
        };

        let size = match fs::metadata(&file_path).await {
            Ok(metadata) if metadata.is_file() => metadata.len(),
            Ok(_) => return Ok(None),
            Err(error) if is_missing_file_error(&error) => return Ok(None),
            Err(error) => return Err(DomainError::internal(error)),
        };
        let file = match fs::File::open(&file_path).await {
            Ok(file) => file,
            // Removed between the stat and the open.
            Err(error) if is_missing_file_error(&error) => return Ok(None),
            Err(error) => return Err(DomainError::internal(error)),
        };

        let content_type = file_path
            .extension()
            .and_then(|extension| extension.to_str())
            .and_then(|extension| mime_for_extension(&extension.to_lowercase()))
            .unwrap_or(FALLBACK_MIME);
        Ok(Some(LocalStoredObject { file, size, content_type }))
    }
}

#[async_trait]
impl StorageProvider for LocalStorageProvider {
    async fn get_presigned_upload_url(
        &self,
        key: &str,
        _mime_type: &str,
        _ttl_seconds: Option<u64>,
    ) -> DomainResult<String> {
        Self::create_parent_dir(&self.joined_path(key)).await.map_err(DomainError::internal)?;
        // In local dev, return a URL that the API itself handles for the upload.
        Ok(format!("{}/_upload/{}", self.base_url, utf8_percent_encode(key, URI_COMPONENT)))
    }

    async fn get_signed_url(&self, key: &str, _ttl_seconds: Option<u64>) -> DomainResult<String> {
        Ok(format!("{}/{key}", self.base_url))
    }

    async fn put_object(&self, key: &str, data: &[u8], _mime_type: &str) -> DomainResult<()> {
        let file_path = self.joined_path(key);
        Self::create_parent_dir(&file_path).await.map_err(DomainError::internal)?;
        fs::write(&file_path, data).await.map_err(DomainError::internal)
    }

    async fn delete(&self, key: &str) -> DomainResult<()> {
        // Ignored on purpose: a file that is already gone is not an error.
        let _ = fs::remove_file(self.joined_path(key)).await;
        Ok(())
    }

    async fn delete_many(&self, keys: &[String]) -> DomainResult<()> {
        // There is no batch unlink. `delete` already swallows a missing
        // file, so one bad key cannot fail the rest.
        for key in keys {
            self.delete(key).await?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use tempfile::TempDir;
    use tokio::io::AsyncReadExt;

    use super::*;

    /// A provider over a fresh directory. Canonicalized, because the system
    /// temp dir is itself a symlink on macOS.
    fn provider() -> (LocalStorageProvider, TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().canonicalize().unwrap().join("uploads");
        (LocalStorageProvider::new(&root, 3001), dir, root)
    }

    fn keys(keys: &[&str]) -> Vec<String> {
        keys.iter().map(|key| key.to_string()).collect()
    }

    // ── get_presigned_upload_url ────────────────────────────────────────

    #[tokio::test]
    async fn creates_the_parent_directory_for_the_key() {
        let (provider, _dir, root) = provider();

        provider
            .get_presigned_upload_url("users/u1/apps/app-1/file.pdf", "application/pdf", None)
            .await
            .unwrap();

        assert!(root.join("users/u1/apps/app-1").is_dir());
        assert!(!root.join("users/u1/apps/app-1/file.pdf").exists());
    }

    #[tokio::test]
    async fn returns_an_upload_url_containing_the_encoded_key() {
        let (provider, _dir, _root) = provider();

        let url = provider
            .get_presigned_upload_url("some key/file!~*'()é.pdf", "application/pdf", Some(60))
            .await
            .unwrap();

        assert_eq!(url, "http://localhost:3001/uploads/_upload/some%20key%2Ffile!~*'()%C3%A9.pdf");
    }

    #[tokio::test]
    async fn uses_the_port_it_was_given() {
        let dir = tempfile::tempdir().unwrap();
        let provider = LocalStorageProvider::new(dir.path(), 4000);

        let url = provider.get_presigned_upload_url("file.pdf", "application/pdf", None).await;

        assert_eq!(url.unwrap(), "http://localhost:4000/uploads/_upload/file.pdf");
    }

    // ── get_signed_url ──────────────────────────────────────────────────

    #[tokio::test]
    async fn returns_a_read_url_containing_the_key_as_given() {
        let (provider, _dir, _root) = provider();

        let url = provider.get_signed_url("users/u1/my resume.pdf", None).await.unwrap();

        assert_eq!(url, "http://localhost:3001/uploads/users/u1/my resume.pdf");
    }

    // ── put_object ──────────────────────────────────────────────────────

    #[tokio::test]
    async fn writes_the_object_creating_its_directories_and_replaces_it_on_a_second_put() {
        let (provider, _dir, root) = provider();
        let key = "users/u1/applications/a1/resume.pdf";

        provider.put_object(key, b"first", "application/pdf").await.unwrap();
        assert_eq!(std::fs::read(root.join(key)).unwrap(), b"first");

        provider.put_object(key, b"second", "application/pdf").await.unwrap();
        assert_eq!(std::fs::read(root.join(key)).unwrap(), b"second");
    }

    #[tokio::test]
    async fn a_key_with_a_leading_slash_still_lands_inside_the_upload_dir() {
        let (provider, _dir, root) = provider();

        provider.put_object("/absolute/file.txt", b"x", "text/plain").await.unwrap();

        assert!(root.join("absolute/file.txt").is_file());
    }

    #[tokio::test]
    async fn fails_when_the_object_cannot_be_written() {
        let (provider, _dir, root) = provider();
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("blocker"), b"a file, not a directory").unwrap();

        let err = provider.put_object("blocker/file.txt", b"x", "text/plain").await.unwrap_err();

        assert_eq!(err.code(), crate::use_cases::errors::ErrorCode::InternalError);
    }

    // ── delete / delete_many ────────────────────────────────────────────

    #[tokio::test]
    async fn deletes_the_file_at_the_key() {
        let (provider, _dir, root) = provider();
        provider.put_object("users/u1/resume.pdf", b"x", "application/pdf").await.unwrap();

        provider.delete("users/u1/resume.pdf").await.unwrap();

        assert!(!root.join("users/u1/resume.pdf").exists());
    }

    #[tokio::test]
    async fn swallows_the_error_when_the_file_does_not_exist() {
        let (provider, _dir, _root) = provider();

        provider.delete("missing.pdf").await.unwrap();
        provider.delete("no/such/dir/missing.pdf").await.unwrap();
    }

    #[tokio::test]
    async fn delete_many_removes_every_key() {
        let (provider, _dir, root) = provider();
        provider.put_object("a/one.pdf", b"1", "application/pdf").await.unwrap();
        provider.put_object("b/two.pdf", b"2", "application/pdf").await.unwrap();
        provider.put_object("c/kept.pdf", b"3", "application/pdf").await.unwrap();

        provider.delete_many(&keys(&["a/one.pdf", "b/two.pdf"])).await.unwrap();

        assert!(!root.join("a/one.pdf").exists());
        assert!(!root.join("b/two.pdf").exists());
        assert!(root.join("c/kept.pdf").exists());
    }

    #[tokio::test]
    async fn delete_many_does_nothing_for_an_empty_batch() {
        let (provider, _dir, root) = provider();

        provider.delete_many(&[]).await.unwrap();

        assert!(!root.exists());
    }

    #[tokio::test]
    async fn delete_many_keeps_deleting_after_one_key_fails() {
        let (provider, _dir, root) = provider();
        provider.put_object("here.pdf", b"x", "application/pdf").await.unwrap();

        provider.delete_many(&keys(&["gone.pdf", "here.pdf"])).await.unwrap();

        assert!(!root.join("here.pdf").exists());
    }

    // ── resolve_key_path ────────────────────────────────────────────────

    #[test]
    fn maps_a_key_to_a_path_inside_the_upload_dir() {
        let (provider, _dir, root) = provider();

        assert_eq!(
            provider.resolve_key_path("documents/app-1/doc-1.pdf"),
            Some(root.join("documents/app-1/doc-1.pdf"))
        );
        assert_eq!(provider.resolve_key_path("a//b/./c.txt"), Some(root.join("a/b/c.txt")));
        assert_eq!(
            provider.resolve_key_path("..hidden/file..txt"),
            Some(root.join("..hidden/file..txt"))
        );
    }

    #[test]
    fn rejects_a_key_that_would_land_outside_the_upload_dir() {
        let (provider, _dir, root) = provider();
        let sibling = format!("{}-evil/file.txt", root.display());

        for (label, key) in [
            ("a parent-directory segment", "../secret.txt"),
            ("a nested parent-directory segment", "users/u1/../../../etc/passwd"),
            ("a parent segment that stays inside", "users/u1/../u2/file.pdf"),
            ("a trailing parent segment", "users/.."),
            ("a backslash traversal", "users\\..\\..\\secret.txt"),
            ("an absolute path", "/etc/passwd"),
            ("an absolute path to a sibling of the upload dir", sibling.as_str()),
            ("a NUL byte", "users/u1/file.pdf\0.txt"),
            ("an empty key", ""),
            ("the upload dir itself", "."),
            ("the upload dir itself, spelled with slashes", "./"),
        ] {
            assert_eq!(provider.resolve_key_path(key), None, "{label}");
        }
    }

    #[test]
    fn an_absolute_key_inside_the_upload_dir_resolves_to_itself() {
        let (provider, _dir, root) = provider();
        let inside = root.join("users/u1/file.pdf");

        assert_eq!(provider.resolve_key_path(inside.to_str().unwrap()), Some(inside));
    }

    #[test]
    fn normalizes_the_upload_dir_it_is_given() {
        let provider = LocalStorageProvider::new("/srv/app/./data/../uploads/", 3001);

        assert_eq!(
            provider.resolve_key_path("a.txt"),
            Some(PathBuf::from("/srv/app/uploads/a.txt"))
        );
    }

    #[test]
    fn the_default_upload_dir_is_uploads_under_the_working_directory() {
        assert_eq!(
            LocalStorageProvider::default_upload_dir().unwrap(),
            std::env::current_dir().unwrap().join("uploads")
        );
    }

    // ── open_object ─────────────────────────────────────────────────────

    #[tokio::test]
    async fn returns_a_file_size_and_content_type_for_a_stored_file() {
        let (provider, _dir, _root) = provider();
        let key = "documents/app-1/doc-1.pdf";
        provider.put_object(key, b"%PDF-1.7 forty-two", "application/pdf").await.unwrap();

        let mut object = provider.open_object(key).await.unwrap().unwrap();

        assert_eq!(object.size, 18);
        assert_eq!(object.content_type, "application/pdf");
        let mut contents = Vec::new();
        object.file.read_to_end(&mut contents).await.unwrap();
        assert_eq!(contents, b"%PDF-1.7 forty-two");
    }

    #[tokio::test]
    async fn derives_the_content_type_from_the_extension() {
        let (provider, _dir, _root) = provider();

        for (name, content_type) in [
            (
                "report.DOCX",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
            ("notes.txt", "text/plain; charset=utf-8"),
            ("readme.md", "text/markdown; charset=utf-8"),
            ("old.doc", "application/msword"),
            ("letter.odt", "application/vnd.oasis.opendocument.text"),
            ("letter.rtf", "application/rtf"),
            ("photo.png", "image/png"),
            ("photo.jpg", "image/jpeg"),
            ("photo.JPEG", "image/jpeg"),
            ("archive.zip", "application/octet-stream"),
            ("no-extension", "application/octet-stream"),
            (".pdf", "application/octet-stream"),
        ] {
            let key = format!("users/u1/applications/a1/{name}");
            provider.put_object(&key, b"x", "text/plain").await.unwrap();

            let object = provider.open_object(&key).await.unwrap().unwrap();

            assert_eq!(object.content_type, content_type, "{name}");
        }
    }

    #[tokio::test]
    async fn returns_none_for_an_invalid_key_even_when_a_file_is_there() {
        let (provider, dir, _root) = provider();
        std::fs::write(dir.path().join("secret.txt"), b"outside").unwrap();

        assert!(provider.open_object("../secret.txt").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn returns_none_when_no_file_exists_at_the_key() {
        let (provider, _dir, _root) = provider();
        provider.put_object("users/u1/file.pdf", b"x", "application/pdf").await.unwrap();

        assert!(provider.open_object("users/u1/missing.pdf").await.unwrap().is_none());
        // A path that runs through a file rather than a directory.
        assert!(provider.open_object("users/u1/file.pdf/nested.pdf").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn returns_none_when_the_key_names_a_directory() {
        let (provider, _dir, _root) = provider();
        provider.put_object("users/u1/file.pdf", b"x", "application/pdf").await.unwrap();

        assert!(provider.open_object("users/u1").await.unwrap().is_none());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn fails_on_a_filesystem_error_other_than_a_missing_file() {
        use std::os::unix::fs::PermissionsExt;

        let (provider, _dir, root) = provider();
        provider.put_object("locked/file.pdf", b"x", "application/pdf").await.unwrap();
        let locked = root.join("locked");
        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o000)).unwrap();

        let result = provider.open_object("locked/file.pdf").await;

        std::fs::set_permissions(&locked, std::fs::Permissions::from_mode(0o755)).unwrap();
        // Permissions do not bind root, which some CI containers run as.
        if let Err(err) = result {
            assert_eq!(err.code(), crate::use_cases::errors::ErrorCode::InternalError);
        }
    }

    #[test]
    fn normalize_resolves_dots_and_repeated_separators() {
        assert_eq!(normalize("/a/b/../c/./d//e/"), "/a/c/d/e");
        assert_eq!(normalize("/../../etc"), "/etc");
        assert_eq!(normalize("/"), "/");
    }
}
