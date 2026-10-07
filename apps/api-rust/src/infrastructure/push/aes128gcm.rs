//! Web Push message encryption (RFC 8291) in the `aes128gcm` content
//! encoding (RFC 8188): what the `web-push` and `http_ece` npm packages do
//! for `apps/api`.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use hkdf::Hkdf;
use p256::ecdh::EphemeralSecret;
use p256::elliptic_curve::sec1::ToEncodedPoint;
use p256::PublicKey;
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;

/// The record size written in the header; each record carries up to
/// `RECORD_SIZE - RECORD_OVERHEAD` bytes of the message.
pub const RECORD_SIZE: u32 = 4096;
pub const TAG_LENGTH: usize = 16;
/// The padding delimiter byte plus the authentication tag.
const RECORD_OVERHEAD: usize = 1 + TAG_LENGTH;
pub const SALT_LENGTH: usize = 16;
pub const KEY_LENGTH: usize = 16;
pub const NONCE_LENGTH: usize = 12;
/// An uncompressed P-256 point.
pub const PUBLIC_KEY_LENGTH: usize = 65;
pub const MIN_AUTH_SECRET_LENGTH: usize = 16;

const LAST_RECORD_DELIMITER: u8 = 2;
const RECORD_DELIMITER: u8 = 1;

pub const KEY_INFO_PREFIX: &[u8] = b"WebPush: info\0";
pub const CEK_INFO: &[u8] = b"Content-Encoding: aes128gcm\0";
pub const NONCE_INFO: &[u8] = b"Content-Encoding: nonce\0";

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum EncryptError {
    /// The message Node gives when the subscription's key is 65 bytes that
    /// are not a point on the curve.
    #[error("Public key is not valid for specified curve")]
    InvalidPublicKey,
    #[error("the push message could not be encrypted")]
    Cipher,
}

/// The content-encryption key and nonce base for one message.
pub fn derive_key_and_nonce(
    shared_secret: &[u8],
    auth_secret: &[u8],
    receiver_public: &[u8],
    sender_public: &[u8],
    salt: &[u8],
) -> Result<([u8; KEY_LENGTH], [u8; NONCE_LENGTH]), EncryptError> {
    let key_info = [KEY_INFO_PREFIX, receiver_public, sender_public].concat();
    let mut input_key = [0u8; 32];
    Hkdf::<Sha256>::new(Some(auth_secret), shared_secret)
        .expand(&key_info, &mut input_key)
        .map_err(|_| EncryptError::Cipher)?;

    let prk = Hkdf::<Sha256>::new(Some(salt), &input_key);
    let mut key = [0u8; KEY_LENGTH];
    let mut nonce = [0u8; NONCE_LENGTH];
    prk.expand(CEK_INFO, &mut key).map_err(|_| EncryptError::Cipher)?;
    prk.expand(NONCE_INFO, &mut nonce).map_err(|_| EncryptError::Cipher)?;
    Ok((key, nonce))
}

/// The nonce for record `counter`: the base with the counter XORed into its
/// low-order bytes.
pub fn record_nonce(base: &[u8; NONCE_LENGTH], counter: u64) -> [u8; NONCE_LENGTH] {
    let mut nonce = *base;
    for (byte, counter_byte) in nonce[NONCE_LENGTH - 8..].iter_mut().zip(counter.to_be_bytes()) {
        *byte ^= counter_byte;
    }
    nonce
}

/// Encrypts `plaintext` for the subscription whose public key is
/// `receiver_public` (65 bytes, uncompressed) and whose auth secret is
/// `auth_secret`, under a fresh sender key pair and salt. Returns the whole
/// request body: header, then the records.
pub fn encrypt(
    plaintext: &[u8],
    receiver_public: &[u8],
    auth_secret: &[u8],
) -> Result<Vec<u8>, EncryptError> {
    let receiver_key =
        PublicKey::from_sec1_bytes(receiver_public).map_err(|_| EncryptError::InvalidPublicKey)?;

    let sender_secret = EphemeralSecret::random(&mut OsRng);
    let sender_public = sender_secret.public_key().to_encoded_point(false);
    let shared_secret = sender_secret.diffie_hellman(&receiver_key);

    let mut salt = [0u8; SALT_LENGTH];
    OsRng.fill_bytes(&mut salt);

    let (key, nonce_base) = derive_key_and_nonce(
        shared_secret.raw_secret_bytes(),
        auth_secret,
        receiver_public,
        sender_public.as_bytes(),
        &salt,
    )?;
    let cipher = Aes128Gcm::new_from_slice(&key).map_err(|_| EncryptError::Cipher)?;

    let key_id = sender_public.as_bytes();
    let key_id_length = u8::try_from(key_id.len()).map_err(|_| EncryptError::Cipher)?;
    let mut body = Vec::with_capacity(SALT_LENGTH + 5 + key_id.len() + plaintext.len() + 64);
    body.extend_from_slice(&salt);
    body.extend_from_slice(&RECORD_SIZE.to_be_bytes());
    body.push(key_id_length);
    body.extend_from_slice(key_id);

    let chunk_size = RECORD_SIZE as usize - RECORD_OVERHEAD;
    let mut start = 0;
    let mut counter = 0u64;
    loop {
        let end = (start + chunk_size).min(plaintext.len());
        let is_last = start + chunk_size >= plaintext.len();

        let mut record = plaintext[start..end].to_vec();
        record.push(if is_last { LAST_RECORD_DELIMITER } else { RECORD_DELIMITER });
        let nonce = record_nonce(&nonce_base, counter);
        let sealed = cipher
            .encrypt(Nonce::from_slice(&nonce), record.as_slice())
            .map_err(|_| EncryptError::Cipher)?;
        body.extend_from_slice(&sealed);

        if is_last {
            return Ok(body);
        }
        start = end;
        counter += 1;
    }
}
