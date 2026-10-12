//! Single-use link tokens (password reset, email verification) and backup
//! codes, in the form `apps/api` writes them: the raw value is random bytes
//! as lowercase hex, and only its SHA-256, again as lowercase hex, is stored.
//! A link mailed by one implementation must redeem in the other.

use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// `randomBytes(byte_count).toString('hex')`.
pub fn generate_raw_token(byte_count: usize) -> String {
    let mut bytes = vec![0u8; byte_count];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// `createHash('sha256').update(raw).digest('hex')`.
pub fn hash_token(raw: &str) -> String {
    hex::encode(Sha256::digest(raw.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_to_the_digest_node_produces() {
        // createHash('sha256').update('reset-token-fixture').digest('hex')
        assert_eq!(
            hash_token("reset-token-fixture"),
            "0cd5e50e3f1af13c0a980b0e1d8942db910dd0c04b8611bb96a1c15acd53452b"
        );
    }

    #[test]
    fn a_raw_token_is_two_lowercase_hex_characters_per_byte() {
        let token = generate_raw_token(32);

        assert_eq!(token.len(), 64);
        assert!(token.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
    }

    #[test]
    fn raw_tokens_do_not_repeat() {
        assert_ne!(generate_raw_token(32), generate_raw_token(32));
    }
}
