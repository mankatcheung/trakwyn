//! The at-rest encryption `apps/api` applies to TOTP secrets and LLM API
//! keys: AES-256-GCM under a key derived from a passphrase with scrypt.
//!
//! Both implementations read and write the same rows, so every parameter here
//! is part of the storage format: the scrypt cost (Node's `scryptSync`
//! defaults), the salt each caller passes, the 12-byte IV, the 16-byte tag and
//! the `iv ‖ tag ‖ ciphertext` layout.

use std::fmt::Display;
use std::sync::OnceLock;

use aes_gcm::aead::{AeadInPlace, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce, Tag};

use crate::infrastructure::auth::encoding::random_bytes;
use crate::use_cases::errors::{DomainError, DomainResult};

const IV_BYTES: usize = 12;
const AUTH_TAG_BYTES: usize = 16;
const KEY_BYTES: usize = 32;

/// Node's `scryptSync` defaults: N = 16384 (2^14), r = 8, p = 1.
const SCRYPT_LOG_N: u8 = 14;
const SCRYPT_R: u32 = 8;
const SCRYPT_P: u32 = 1;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub(crate) enum AtRestError {
    /// The passphrase is unset, or is one the configuration refuses.
    #[error("{0}")]
    KeyUnavailable(String),
    #[error("could not derive the encryption key")]
    KeyDerivation,
    /// Shorter than an IV and a tag: not something this cipher wrote.
    #[error("ciphertext is malformed")]
    Malformed,
    /// Wrong key, wrong context, or the value was altered.
    #[error("unable to authenticate data")]
    Authentication,
}

impl From<AtRestError> for DomainError {
    fn from(err: AtRestError) -> Self {
        DomainError::internal(err)
    }
}

/// A passphrase and the AES key scrypt derives from it.
///
/// scrypt is deliberately slow (tens of milliseconds), so the key is derived
/// once, on first use, rather than per call. A passphrase that is missing or
/// refused does not fail construction: as in `apps/api`, the process starts
/// and the error surfaces when something is actually encrypted or decrypted.
pub(crate) struct AtRestKey {
    passphrase: Result<String, String>,
    salt: &'static str,
    derived: OnceLock<Result<[u8; KEY_BYTES], AtRestError>>,
}

impl AtRestKey {
    pub(crate) fn new(passphrase: impl Into<String>, salt: &'static str) -> Self {
        Self { passphrase: Ok(passphrase.into()), salt, derived: OnceLock::new() }
    }

    /// A key that fails every operation with `reason`.
    pub(crate) fn unavailable(reason: impl Display, salt: &'static str) -> Self {
        Self { passphrase: Err(reason.to_string()), salt, derived: OnceLock::new() }
    }

    pub(crate) fn from_passphrase<E: Display>(
        passphrase: Result<String, E>,
        salt: &'static str,
    ) -> Self {
        match passphrase {
            Ok(passphrase) => Self::new(passphrase, salt),
            Err(reason) => Self::unavailable(reason, salt),
        }
    }

    fn cipher(&self) -> Result<Aes256Gcm, AtRestError> {
        let derived = self.derived.get_or_init(|| {
            let passphrase =
                self.passphrase.as_ref().map_err(|r| AtRestError::KeyUnavailable(r.clone()))?;
            let params = scrypt::Params::new(SCRYPT_LOG_N, SCRYPT_R, SCRYPT_P, KEY_BYTES)
                .map_err(|_| AtRestError::KeyDerivation)?;
            let mut key = [0u8; KEY_BYTES];
            scrypt::scrypt(passphrase.as_bytes(), self.salt.as_bytes(), &params, &mut key)
                .map_err(|_| AtRestError::KeyDerivation)?;
            Ok(key)
        });
        let key = derived.as_ref().map_err(Clone::clone)?;
        Ok(Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key)))
    }

    /// Encrypts under a fresh random IV; returns `iv ‖ tag ‖ ciphertext`.
    pub(crate) fn seal(&self, plaintext: &[u8], aad: &[u8]) -> DomainResult<Vec<u8>> {
        Ok(self.seal_with_iv(&random_bytes::<IV_BYTES>(), plaintext, aad)?)
    }

    fn seal_with_iv(
        &self,
        iv: &[u8; IV_BYTES],
        plaintext: &[u8],
        aad: &[u8],
    ) -> Result<Vec<u8>, AtRestError> {
        let cipher = self.cipher()?;
        let mut encrypted = plaintext.to_vec();
        let tag = cipher
            .encrypt_in_place_detached(Nonce::from_slice(iv), aad, &mut encrypted)
            .map_err(|_| AtRestError::Authentication)?;

        let mut sealed = Vec::with_capacity(IV_BYTES + AUTH_TAG_BYTES + encrypted.len());
        sealed.extend_from_slice(iv);
        sealed.extend_from_slice(&tag);
        sealed.extend_from_slice(&encrypted);
        Ok(sealed)
    }

    /// Decrypts `iv ‖ tag ‖ ciphertext`, failing unless the tag authenticates
    /// both the ciphertext and `aad`.
    pub(crate) fn open(&self, sealed: &[u8], aad: &[u8]) -> DomainResult<Vec<u8>> {
        Ok(self.open_inner(sealed, aad)?)
    }

    fn open_inner(&self, sealed: &[u8], aad: &[u8]) -> Result<Vec<u8>, AtRestError> {
        // The key is resolved first so a missing passphrase is reported as
        // that, whatever the ciphertext looks like.
        let cipher = self.cipher()?;
        if sealed.len() < IV_BYTES + AUTH_TAG_BYTES {
            return Err(AtRestError::Malformed);
        }
        let (iv, rest) = sealed.split_at(IV_BYTES);
        let (tag, encrypted) = rest.split_at(AUTH_TAG_BYTES);

        let mut decrypted = encrypted.to_vec();
        cipher
            .decrypt_in_place_detached(
                Nonce::from_slice(iv),
                aad,
                &mut decrypted,
                Tag::from_slice(tag),
            )
            .map_err(|_| AtRestError::Authentication)?;
        Ok(decrypted)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SALT: &str = "at-rest-test-salt";

    fn key() -> AtRestKey {
        AtRestKey::new("at-rest-test-passphrase", SALT)
    }

    /// `scryptSync('at-rest-test-passphrase', 'at-rest-test-salt', 32)` then
    /// `createCipheriv('aes-256-gcm', key, Buffer.alloc(12, 7))` with AAD
    /// `"ctx"` over `"hello"` in Node, laid out `iv ‖ tag ‖ ciphertext`, hex.
    const NODE_SEALED_HEX: &str =
        "070707070707070707070707bfc2fbab2d4ef9403f1bbb796c74d016b2c46965c9";

    #[test]
    fn sealing_with_a_fixed_iv_reproduces_nodes_bytes() {
        let sealed = key().seal_with_iv(&[7u8; IV_BYTES], b"hello", b"ctx").unwrap();
        assert_eq!(hex::encode(sealed), NODE_SEALED_HEX);
    }

    #[test]
    fn opens_what_node_sealed() {
        let sealed = hex::decode(NODE_SEALED_HEX).unwrap();
        assert_eq!(key().open(&sealed, b"ctx").unwrap(), b"hello");
    }

    #[test]
    fn refuses_another_context_another_key_and_altered_bytes() {
        let key = key();
        let sealed = key.seal(b"hello", b"ctx").unwrap();

        assert!(key.open(&sealed, b"other").is_err());
        assert!(AtRestKey::new("another-passphrase", SALT).open(&sealed, b"ctx").is_err());
        assert!(AtRestKey::new("at-rest-test-passphrase", "another-salt")
            .open(&sealed, b"ctx")
            .is_err());
        for index in [0, IV_BYTES, sealed.len() - 1] {
            let mut altered = sealed.clone();
            altered[index] ^= 0xff;
            assert_eq!(key.open_inner(&altered, b"ctx"), Err(AtRestError::Authentication));
        }
    }

    #[test]
    fn refuses_anything_shorter_than_an_iv_and_a_full_tag() {
        let key = key();
        let sealed = key.seal(b"", b"").unwrap();
        assert_eq!(sealed.len(), IV_BYTES + AUTH_TAG_BYTES);
        assert_eq!(key.open(&sealed, b"").unwrap(), b"");

        assert_eq!(key.open_inner(&sealed[..sealed.len() - 1], b""), Err(AtRestError::Malformed));
        assert_eq!(key.open_inner(&[], b""), Err(AtRestError::Malformed));
    }

    #[test]
    fn an_unavailable_key_fails_every_operation_with_its_reason() {
        let key = AtRestKey::unavailable("SOME_KEY must be set", SALT);

        let expected = AtRestError::KeyUnavailable("SOME_KEY must be set".to_string());
        assert_eq!(key.seal_with_iv(&[0; IV_BYTES], b"x", b""), Err(expected.clone()));
        assert_eq!(key.open_inner(&[0; 40], b""), Err(expected));
    }

    #[test]
    fn each_seal_uses_a_fresh_iv() {
        let key = key();
        assert_ne!(key.seal(b"hello", b"").unwrap(), key.seal(b"hello", b"").unwrap());
    }
}
