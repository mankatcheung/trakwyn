//! One-time tokens and codes: how they are minted and how they are stored.
//!
//! Both must stay byte-identical to `apps/api`, which runs against the same
//! tables: a link mailed by one implementation is confirmed by the other.

use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};

/// `randomBytes(bytes).toString('hex')`: lowercase hex, two characters a byte.
pub fn random_hex(bytes: usize) -> String {
    let mut buffer = vec![0u8; bytes];
    OsRng.fill_bytes(&mut buffer);
    hex::encode(buffer)
}

/// `createHash('sha256').update(value).digest('hex')`: what is stored in
/// place of a raw token or backup code.
pub fn sha256_hex(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mints_lowercase_hex_of_twice_the_byte_count() {
        let token = random_hex(32);
        assert_eq!(token.len(), 64);
        assert!(token.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)));
        assert_ne!(token, random_hex(32));
        assert_eq!(random_hex(8).len(), 16);
    }

    #[test]
    fn hashes_exactly_as_node_does() {
        // node -e "console.log(require('crypto').createHash('sha256').update('abc').digest('hex'))"
        assert_eq!(
            sha256_hex("abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_hex(""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }
}
