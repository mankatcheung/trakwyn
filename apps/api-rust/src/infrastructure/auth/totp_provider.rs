use std::fmt::Display;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use chrono::Utc;
use hmac::{Hmac, Mac};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use sha1::Sha1;

use crate::infrastructure::auth::at_rest::AtRestKey;
use crate::infrastructure::auth::encoding::{
    constant_time_eq, decode_base64_lenient, random_bytes,
};
use crate::use_cases::errors::{DomainError, DomainResult};
use crate::use_cases::ports::totp_provider::TotpProvider;

/// Key-derivation salt, NOT a label. Do not rename it.
///
/// It is an input to scrypt, so changing the string changes the derived AES
/// key and every value already encrypted with the old one stops decrypting.
/// The pre-rebrand name is deliberate dead weight: it is load-bearing
/// precisely because it is arbitrary, and it must equal `apps/api`'s
/// (`TotpProvider.ts`), which encrypts the same column.
///
/// Renaming it locks every user with 2FA enabled out of their account: their
/// stored TOTP secret no longer decrypts, so no code ever verifies.
const SCRYPT_SALT: &str = "job-finder-totp-secret";

const ISSUER: &str = "Trakwyn";
/// Accept codes from the adjacent time step to absorb minor clock drift.
const EPOCH_TOLERANCE_S: i64 = 30;

// What `apps/api` gets from otplib's defaults; an authenticator app enrolled
// through either implementation was told nothing else (the `otpauth://` URI
// omits parameters that are the default).
const PERIOD_S: i64 = 30;
const DIGITS: usize = 6;
const DIGITS_MODULUS: u32 = 1_000_000;
const GENERATED_SECRET_BYTES: usize = 20;
/// otplib's guardrails: it refuses to compute a code for a key outside this range.
const MIN_SECRET_BYTES: usize = 16;
const MAX_SECRET_BYTES: usize = 64;

const BASE32_ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BASE32_BITS: usize = 5;
const BASE32_BLOCK: usize = 8;

/// Everything `encodeURIComponent` escapes: all but `A-Z a-z 0-9 - _ . ! ~ * ' ( )`.
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

/// The failures otplib raises as exceptions, with its messages.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum TotpError {
    #[error(
        "Secret is required. Use generateSecret() to create one, or provide via {{ secret: 'YOUR_BASE32_SECRET' }}"
    )]
    SecretMissing,
    #[error("Label is required for URI generation. Example: {{ label: 'user@example.com' }}")]
    LabelMissing,
    #[error("Invalid Base32 string: {0}")]
    InvalidBase32(&'static str),
    #[error("Secret must be at least {min} bytes ({} bits), got {actual} bytes", min * 8)]
    SecretTooShort { min: usize, actual: usize },
    #[error("Secret must not exceed {max} bytes, got {actual} bytes")]
    SecretTooLong { max: usize, actual: usize },
    #[error("Token must be {expected} digits, got {actual}")]
    TokenLength { expected: usize, actual: usize },
    #[error("Token must contain only digits")]
    TokenFormat,
}

impl From<TotpError> for DomainError {
    fn from(err: TotpError) -> Self {
        DomainError::internal(err)
    }
}

fn encode_uri_component(value: &str) -> String {
    utf8_percent_encode(value, URI_COMPONENT).to_string()
}

fn base32_encode(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len().div_ceil(BASE32_BITS) * BASE32_BLOCK);
    let mut buffer: u32 = 0;
    let mut bits = 0;
    for &byte in bytes {
        buffer = (buffer << 8) | u32::from(byte);
        bits += 8;
        while bits >= BASE32_BITS {
            bits -= BASE32_BITS;
            out.push(char::from(BASE32_ALPHABET[((buffer >> bits) & 0x1f) as usize]));
        }
    }
    if bits > 0 {
        out.push(char::from(BASE32_ALPHABET[((buffer << (BASE32_BITS - bits)) & 0x1f) as usize]));
    }
    out
}

/// Decodes a base32 secret the way otplib's scure plugin does: case-folded,
/// padding optional, and strict about everything else (RFC 4648 alphabet, no
/// impossible lengths, no stray bits after the last whole byte).
fn base32_decode(secret: &str) -> Result<Vec<u8>, TotpError> {
    let upper = secret.to_uppercase();
    let mut symbols: Vec<char> = upper.chars().collect();
    let padded_len = symbols.len().div_ceil(BASE32_BLOCK) * BASE32_BLOCK;
    symbols.resize(padded_len, '=');

    while symbols.last() == Some(&'=') {
        let last = symbols.len() - 1;
        if (last * BASE32_BITS).is_multiple_of(8) {
            return Err(TotpError::InvalidBase32("too much padding"));
        }
        symbols.pop();
    }

    let mut out = Vec::with_capacity(symbols.len() * BASE32_BITS / 8);
    let mut buffer: u32 = 0;
    let mut bits = 0;
    for symbol in symbols {
        let value = u8::try_from(symbol)
            .ok()
            .and_then(|byte| BASE32_ALPHABET.iter().position(|&letter| letter == byte))
            .ok_or(TotpError::InvalidBase32("unknown letter"))?;
        // `value` is an index into a 32-entry table.
        buffer = ((buffer << BASE32_BITS) | value as u32) & 0xfff;
        bits += BASE32_BITS;
        if bits >= 8 {
            bits -= 8;
            // Truncation is the point: the eight bits above `bits`.
            out.push((buffer >> bits) as u8);
        }
    }
    if bits >= BASE32_BITS {
        return Err(TotpError::InvalidBase32("excess padding"));
    }
    if buffer & ((1 << bits) - 1) != 0 {
        return Err(TotpError::InvalidBase32("non-zero padding"));
    }
    Ok(out)
}

/// RFC 4226 HOTP with HMAC-SHA1, six digits.
fn hotp(key: &[u8], counter: u64) -> String {
    // HMAC accepts a key of any length, so this cannot fail; the fallback
    // (an empty code, which matches no six-digit token) avoids a panic.
    let Ok(mut mac) = Hmac::<Sha1>::new_from_slice(key) else {
        return String::new();
    };
    mac.update(&counter.to_be_bytes());
    let digest = mac.finalize().into_bytes();

    let offset = usize::from(digest[digest.len() - 1] & 0x0f);
    let binary = (u32::from(digest[offset] & 0x7f) << 24)
        | (u32::from(digest[offset + 1]) << 16)
        | (u32::from(digest[offset + 2]) << 8)
        | u32::from(digest[offset + 3]);
    format!("{:0width$}", binary % DIGITS_MODULUS, width = DIGITS)
}

fn decode_key(secret: &str) -> Result<Vec<u8>, TotpError> {
    if secret.is_empty() {
        return Err(TotpError::SecretMissing);
    }
    let key = base32_decode(secret)?;
    if key.len() < MIN_SECRET_BYTES {
        return Err(TotpError::SecretTooShort { min: MIN_SECRET_BYTES, actual: key.len() });
    }
    if key.len() > MAX_SECRET_BYTES {
        return Err(TotpError::SecretTooLong { max: MAX_SECRET_BYTES, actual: key.len() });
    }
    Ok(key)
}

fn validate_token(token: &str) -> Result<(), TotpError> {
    // JavaScript's `length`: UTF-16 code units.
    let length = token.encode_utf16().count();
    if length != DIGITS {
        return Err(TotpError::TokenLength { expected: DIGITS, actual: length });
    }
    if !token.bytes().all(|b| b.is_ascii_digit()) {
        return Err(TotpError::TokenFormat);
    }
    Ok(())
}

/// The check `apps/api` makes with otplib's
/// `new TOTP({ secret }).verify(code, { epochTolerance: 30 })`: a code is
/// accepted if it is the code of any time step overlapping
/// `[epoch - 30 s, epoch + 30 s]`.
fn verify_at(secret: &str, code: &str, epoch_s: i64) -> Result<bool, TotpError> {
    let key = decode_key(secret)?;
    validate_token(code)?;

    let min_counter = (epoch_s - EPOCH_TOLERANCE_S).div_euclid(PERIOD_S).max(0);
    let max_counter = (epoch_s + EPOCH_TOLERANCE_S).div_euclid(PERIOD_S);
    for counter in min_counter..=max_counter {
        let Ok(counter) = u64::try_from(counter) else { continue };
        if constant_time_eq(hotp(&key, counter).as_bytes(), code.as_bytes()) {
            return Ok(true);
        }
    }
    Ok(false)
}

/// RFC 6238 TOTP (HMAC-SHA1, six digits, 30-second steps) and the encryption
/// of its secrets at rest, interchangeable with `apps/api`'s `TotpProvider`:
/// a secret enrolled or encrypted by either implementation works in the other.
pub struct Rfc6238TotpProvider {
    key: AtRestKey,
}

impl Rfc6238TotpProvider {
    /// `passphrase` is `TOTP_ENCRYPTION_KEY`.
    pub fn new(passphrase: impl Into<String>) -> Self {
        Self { key: AtRestKey::new(passphrase, SCRYPT_SALT) }
    }

    /// Takes `AuthConfig::totp_passphrase()`. An `Err` (the key is unset, or
    /// is the placeholder in production) does not prevent construction: codes
    /// can still be generated and verified, and every encrypt or decrypt
    /// fails with that reason, as in `apps/api`.
    pub fn from_passphrase<E: Display>(passphrase: Result<String, E>) -> Self {
        Self { key: AtRestKey::from_passphrase(passphrase, SCRYPT_SALT) }
    }
}

impl TotpProvider for Rfc6238TotpProvider {
    fn generate_secret(&self) -> String {
        base32_encode(&random_bytes::<GENERATED_SECRET_BYTES>())
    }

    fn get_otpauth_url(&self, secret: &str, label: &str) -> DomainResult<String> {
        if secret.is_empty() {
            return Err(TotpError::SecretMissing.into());
        }
        if label.is_empty() {
            return Err(TotpError::LabelMissing.into());
        }
        // The label is `issuer:account`. Each `:`-separated part is encoded on
        // its own, so a `:` inside the account stays a literal `:`.
        let encoded_label = format!("{ISSUER}:{label}")
            .split(':')
            .map(encode_uri_component)
            .collect::<Vec<_>>()
            .join(":");
        Ok(format!(
            "otpauth://totp/{encoded_label}?secret={}&issuer={}",
            encode_uri_component(secret),
            encode_uri_component(ISSUER)
        ))
    }

    fn verify_code(&self, secret: &str, code: &str) -> DomainResult<bool> {
        Ok(verify_at(secret, code, Utc::now().timestamp())?)
    }

    fn encrypt_secret(&self, secret: &str) -> DomainResult<String> {
        Ok(STANDARD.encode(self.key.seal(secret.as_bytes(), b"")?))
    }

    fn decrypt_secret(&self, encrypted_secret: &str) -> DomainResult<String> {
        let decrypted = self.key.open(&decode_base64_lenient(encrypted_secret), b"")?;
        Ok(String::from_utf8_lossy(&decrypted).into_owned())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::OnceLock;

    use super::*;
    use crate::use_cases::errors::ErrorCode;

    /// base32 of `12345678901234567890`, the RFC 6238 test key.
    const SECRET: &str = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

    /// Shared so scrypt runs once for the whole module, not once per test.
    fn provider() -> &'static Rfc6238TotpProvider {
        static PROVIDER: OnceLock<Rfc6238TotpProvider> = OnceLock::new();
        PROVIDER
            .get_or_init(|| Rfc6238TotpProvider::new("cross-impl-test-passphrase-not-a-real-key"))
    }

    // ----- codes ---------------------------------------------------------

    /// Codes otplib 13.5.0 (the library and configuration `apps/api` uses:
    /// `new TOTP({ crypto: NobleCryptoPlugin, base32: ScureBase32Plugin,
    /// secret })`) generated for `SECRET` at each epoch, via
    /// `totp.generate({ epoch })` under `tsx`. The first three are also the
    /// low six digits of the RFC 6238 appendix B SHA-1 vectors.
    const NODE_CODES: [(i64, &str); 11] = [
        (59, "287082"),
        (1_111_111_109, "081804"),
        (1_234_567_890, "005924"),
        (1_699_999_940, "713364"),
        (1_699_999_970, "276857"),
        (1_700_000_000, "921300"),
        (1_700_000_030, "732303"),
        (1_700_000_060, "136087"),
        (1_700_000_090, "253938"),
        (2_000_000_000, "279037"),
        (20_000_000_000, "353130"),
    ];

    fn node_code(epoch_s: i64) -> &'static str {
        NODE_CODES.iter().find(|(epoch, _)| *epoch == epoch_s).unwrap().1
    }

    #[test]
    fn generates_the_codes_otplib_generates() {
        let key = base32_decode(SECRET).unwrap();
        for (epoch_s, code) in NODE_CODES {
            let counter = u64::try_from(epoch_s / PERIOD_S).unwrap();
            assert_eq!(hotp(&key, counter), code, "epoch {epoch_s}");
        }
    }

    #[test]
    fn verifies_a_code_an_authenticator_would_show_now() {
        for (epoch_s, code) in NODE_CODES {
            assert_eq!(verify_at(SECRET, code, epoch_s), Ok(true), "epoch {epoch_s}");
        }
    }

    /// The verdicts otplib returned for
    /// `totp.verify(codeFor(codeEpoch), { epoch: now, epochTolerance: 30 })`,
    /// the exact call `TotpProvider.verifyCode` makes, at three points in a
    /// time step: one step either side is accepted while it is within 30 s,
    /// and nothing further.
    #[test]
    fn accepts_exactly_the_window_otplib_accepts() {
        const CODE_EPOCHS: [i64; 6] = [
            1_699_999_940,
            1_699_999_970,
            1_700_000_000,
            1_700_000_030,
            1_700_000_060,
            1_700_000_090,
        ];
        const NODE_VERDICTS: [(i64, [bool; 6]); 3] = [
            (1_700_000_010, [false, false, true, true, true, false]),
            (1_700_000_039, [false, false, true, true, true, false]),
            (1_700_000_040, [false, false, false, true, true, true]),
        ];

        for (now, verdicts) in NODE_VERDICTS {
            for (code_epoch, expected) in CODE_EPOCHS.into_iter().zip(verdicts) {
                assert_eq!(
                    verify_at(SECRET, node_code(code_epoch), now),
                    Ok(expected),
                    "now {now}, code from {code_epoch}"
                );
            }
        }
    }

    #[test]
    fn the_window_does_not_reach_before_the_epoch() {
        // otplib clamps the first counter at zero.
        assert_eq!(verify_at(SECRET, &hotp(&base32_decode(SECRET).unwrap(), 0), 5), Ok(true));
    }

    #[test]
    fn rejects_an_invalid_code() {
        let provider = provider();
        let secret = provider.generate_secret();
        // One in a million would be a false failure per accepted step; a
        // second, different code cannot also be current.
        let first = provider.verify_code(&secret, "000000").unwrap();
        let second = provider.verify_code(&secret, "000001").unwrap();
        assert!(!(first && second));
        assert_eq!(verify_at(SECRET, "000000", 1_700_000_000), Ok(false));
    }

    /// What `TotpProvider.verifyCode` did with each input under `tsx`: the
    /// first group threw (the error named in the comment), the second
    /// returned `false`.
    #[test]
    fn fails_where_otplib_throws() {
        let now = 1_700_000_000;
        // SecretTooShortError: Secret must be at least 16 bytes (128 bits), got 10 bytes
        let err = verify_at("JBSWY3DPEHPK3PXP", "123456", now).unwrap_err();
        assert_eq!(err, TotpError::SecretTooShort { min: 16, actual: 10 });
        assert_eq!(err.to_string(), "Secret must be at least 16 bytes (128 bits), got 10 bytes");
        // SecretTooLongError: Secret must not exceed 64 bytes, got 65 bytes
        let err = verify_at(&"A".repeat(104), "000000", now).unwrap_err();
        assert_eq!(err.to_string(), "Secret must not exceed 64 bytes, got 65 bytes");
        // TokenLengthError: Token must be 6 digits, got 5 / 7 / 0
        for (code, length) in [("12345", 5), ("1234567", 7), ("", 0)] {
            let err = verify_at(SECRET, code, now).unwrap_err();
            assert_eq!(err.to_string(), format!("Token must be 6 digits, got {length}"));
        }
        // TokenFormatError: Token must contain only digits
        let err = verify_at(SECRET, "12a456", now).unwrap_err();
        assert_eq!(err.to_string(), "Token must contain only digits");
        // SecretMissingError
        assert_eq!(verify_at("", "123456", now), Err(TotpError::SecretMissing));
        // Error: Invalid Base32 string: Unknown letter "1". ...
        assert!(matches!(
            verify_at("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJ1", "123456", now),
            Err(TotpError::InvalidBase32(_))
        ));
        // Error: Invalid Base32 string: Excess padding
        assert!(matches!(
            verify_at(&format!("{SECRET}G"), "000000", now),
            Err(TotpError::InvalidBase32(_))
        ));
        // Error: Invalid Base32 string: Non-zero padding: 64
        assert!(matches!(
            verify_at(&format!("{SECRET}GF"), "000000", now),
            Err(TotpError::InvalidBase32(_))
        ));
    }

    #[test]
    fn tolerates_what_otplib_tolerates_in_a_secret() {
        let now = 1_700_000_000;
        let current = node_code(now);
        // Lower case, and explicit padding, decode to the same key.
        assert_eq!(verify_at(&SECRET.to_lowercase(), current, now), Ok(true));
        assert_eq!(verify_at(&format!("{SECRET}GE======"), "000000", now), Ok(false));
        // A trailing partial group whose spare bits are zero.
        assert_eq!(verify_at(&format!("{SECRET}GE"), "000000", now), Ok(false));
        // Exactly the 64-byte maximum.
        assert_eq!(verify_at(&"A".repeat(103), "000000", now), Ok(false));
    }

    #[test]
    fn the_port_reports_a_malformed_code_as_an_internal_error() {
        let err = provider().verify_code(SECRET, "12345").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
    }

    // ----- secrets and URIs ----------------------------------------------

    #[test]
    fn generates_a_32_character_base32_secret() {
        // otplib's default: 20 random bytes, unpadded. A sample from
        // `TotpProvider.generateSecret()`: ZY2Y7YRPARUOXKSDRFNKJWNI6ZHMCWMP.
        let secret = provider().generate_secret();
        assert_eq!(secret.len(), 32);
        assert!(secret.bytes().all(|b| BASE32_ALPHABET.contains(&b)));
        assert_eq!(base32_decode(&secret).unwrap().len(), 20);
    }

    #[test]
    fn returns_a_different_secret_on_each_call() {
        assert_ne!(provider().generate_secret(), provider().generate_secret());
    }

    #[test]
    fn base32_round_trips_and_matches_rfc_4648() {
        assert_eq!(base32_encode(b"12345678901234567890"), SECRET);
        assert_eq!(base32_decode(SECRET).unwrap(), b"12345678901234567890");
        assert_eq!(base32_encode(b"foobar"), "MZXW6YTBOI");
        assert_eq!(base32_decode("MZXW6YTBOI").unwrap(), b"foobar");
        assert_eq!(base32_decode("MZXW6YTBOI======").unwrap(), b"foobar");
        assert_eq!(base32_encode(b"f"), "MY");
    }

    /// Output of `TotpProvider.getOtpauthUrl(SECRET, label)` under `tsx` for
    /// a plain address and for a label exercising every class of character
    /// `encodeURIComponent` treats differently, including the `:` otplib
    /// leaves literal.
    #[test]
    fn builds_the_otpauth_url_apps_api_builds() {
        assert_eq!(
            provider().get_otpauth_url(SECRET, "user@example.com").unwrap(),
            "otpauth://totp/Trakwyn:user%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Trakwyn"
        );
        assert_eq!(
            provider().get_otpauth_url(SECRET, "a b+c:d/é'(x)!*~@example.com").unwrap(),
            "otpauth://totp/Trakwyn:a%20b%2Bc:d%2F%C3%A9'(x)!*~%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Trakwyn"
        );
    }

    #[test]
    fn an_otpauth_url_needs_a_secret_and_a_label() {
        // SecretMissingError and LabelMissingError in otplib.
        let err = provider().get_otpauth_url("", "a@b.c").unwrap_err();
        assert!(err.to_string().contains("Secret is required"));
        let err = provider().get_otpauth_url(SECRET, "").unwrap_err();
        assert!(err.to_string().contains("Label is required for URI generation"));
    }

    // ----- encryption at rest --------------------------------------------

    /// Output of `TotpProvider.encryptSecret(SECRET)` in
    /// `apps/api/src/infrastructure/auth/TotpProvider.ts`, run under `tsx`
    /// with `TOTP_ENCRYPTION_KEY=cross-impl-test-passphrase-not-a-real-key`.
    const NODE_ENCRYPTED: &str =
        "x5ND0Nk6LM7ruL6GJ1h2bIcQie/fiFFGjsYxXCfcYpypmxhPqmgmdtDTeZ5YEZD7f2vH2E8RAxvdSNbd";
    /// The same, for the plaintext `sécret ✓` (multi-byte UTF-8).
    const NODE_ENCRYPTED_UNICODE: &str = "X+Sz2IBvyDtCr//YtYCOyCcb8QXeN3WiVTYnMYKOCmDrktdwSBfX";

    #[test]
    fn decrypts_a_secret_encrypted_by_the_node_implementation() {
        assert_eq!(provider().decrypt_secret(NODE_ENCRYPTED).unwrap(), SECRET);
        assert_eq!(provider().decrypt_secret(NODE_ENCRYPTED_UNICODE).unwrap(), "sécret ✓");
    }

    /// The fixture `apps/api`'s `scryptSaltsArePinned.test.ts` pins: a
    /// ciphertext produced under the passphrase
    /// `salt-pinning-test-passphrase`. If the salt here ever drifts from
    /// `apps/api`'s, this stops decrypting, as every user's stored secret would.
    #[test]
    fn the_scrypt_salt_is_pinned_to_apps_apis() {
        let provider = Rfc6238TotpProvider::new("salt-pinning-test-passphrase");
        let encrypted_before = "fVsj57v3RY8Ubm+gsHX7VRSG5aUr4vSOXHpkH+jBz11ghKPdQnS9Llfz5lU=";

        assert_eq!(provider.decrypt_secret(encrypted_before).unwrap(), "JBSWY3DPEHPK3PXP");
    }

    #[test]
    fn writes_the_layout_the_node_implementation_writes() {
        // Standard base64 with padding of `iv(12) ‖ tag(16) ‖ ciphertext`:
        // the same length, alphabet and structure as NODE_ENCRYPTED. (That
        // Node can open it follows from `at_rest`'s fixed-IV vector, which
        // reproduces Node's bytes exactly.)
        let encrypted = provider().encrypt_secret(SECRET).unwrap();

        assert_eq!(encrypted.len(), NODE_ENCRYPTED.len());
        let raw = STANDARD.decode(&encrypted).unwrap();
        assert_eq!(raw.len(), 12 + 16 + SECRET.len());
        assert_eq!(provider().decrypt_secret(&encrypted).unwrap(), SECRET);
    }

    #[test]
    fn does_not_store_the_plaintext_secret_in_the_ciphertext() {
        let encrypted = provider().encrypt_secret("JBSWY3DPEHPK3PXP").unwrap();
        assert!(!encrypted.contains("JBSWY3DPEHPK3PXP"));
    }

    #[test]
    fn produces_different_ciphertext_for_the_same_plaintext_on_each_call() {
        let provider = provider();
        let first = provider.encrypt_secret("JBSWY3DPEHPK3PXP").unwrap();
        let second = provider.encrypt_secret("JBSWY3DPEHPK3PXP").unwrap();

        assert_ne!(first, second);
        assert_eq!(provider.decrypt_secret(&first).unwrap(), "JBSWY3DPEHPK3PXP");
        assert_eq!(provider.decrypt_secret(&second).unwrap(), "JBSWY3DPEHPK3PXP");
    }

    #[test]
    fn fails_when_the_ciphertext_has_been_tampered_with() {
        let provider = provider();
        let mut bytes =
            STANDARD.decode(provider.encrypt_secret("JBSWY3DPEHPK3PXP").unwrap()).unwrap();
        *bytes.last_mut().unwrap() ^= 0xff;

        let err = provider.decrypt_secret(&STANDARD.encode(bytes)).unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
    }

    #[test]
    fn fails_on_a_secret_encrypted_under_another_passphrase() {
        let other = Rfc6238TotpProvider::new("another-passphrase-not-real");
        assert!(other.decrypt_secret(NODE_ENCRYPTED).is_err());
    }

    #[test]
    fn fails_on_something_that_is_not_a_ciphertext() {
        // All three throw in apps/api too (invalid IV / invalid tag length).
        for garbage in ["", "AAAA", "!!!not base64!!!"] {
            assert!(provider().decrypt_secret(garbage).is_err(), "{garbage:?}");
        }
    }

    #[test]
    fn fails_with_the_reason_when_the_key_is_not_usable() {
        let provider = Rfc6238TotpProvider::from_passphrase(Err::<String, _>(
            "TOTP_ENCRYPTION_KEY must be set",
        ));

        let err = provider.encrypt_secret("JBSWY3DPEHPK3PXP").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(err.to_string().contains("TOTP_ENCRYPTION_KEY"));
        assert!(provider
            .decrypt_secret(NODE_ENCRYPTED)
            .unwrap_err()
            .to_string()
            .contains("TOTP_ENCRYPTION_KEY"));

        // Nothing but encryption needs the key.
        assert_eq!(provider.generate_secret().len(), 32);
        assert!(provider.get_otpauth_url(SECRET, "user@example.com").is_ok());
        assert!(provider.verify_code(SECRET, "000000").is_ok());
    }
}
