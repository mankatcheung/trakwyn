//! Opaque bearer secrets (`trakwyn_...` API tokens, `jfsl_...` share links):
//! a prefix followed by hex-encoded random bytes, stored only as a hash.
//!
//! The format is `apps/api`'s, byte for byte, so a secret minted by either
//! implementation authenticates against the other:
//! `prefix + randomBytes(n).toString('hex')`, hashed as
//! `createHash('sha256').update(raw).digest('hex')`.

use rand::rngs::OsRng;
use rand::RngCore;
use sha2::{Digest, Sha256};

use crate::use_cases::errors::{DomainError, DomainResult};

/// A new raw secret: `prefix` then `random_bytes` bytes from the operating
/// system's generator, in lowercase hex.
pub fn generate(prefix: &str, random_bytes: usize) -> DomainResult<String> {
    let mut bytes = vec![0_u8; random_bytes];
    OsRng.try_fill_bytes(&mut bytes).map_err(DomainError::internal)?;
    Ok(format!("{prefix}{}", hex::encode(bytes)))
}

/// What is stored and looked up: the lowercase hex SHA-256 of the raw secret.
pub fn hash(raw_token: &str) -> String {
    hex::encode(Sha256::digest(raw_token.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_secret_is_the_prefix_and_lowercase_hex() {
        let raw = generate("trakwyn_", 24).unwrap();
        let body = raw.strip_prefix("trakwyn_").unwrap();
        assert_eq!(body.len(), 48);
        assert!(body.bytes().all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f')));
    }

    #[test]
    fn two_secrets_differ() {
        assert_ne!(generate("jfsl_", 24).unwrap(), generate("jfsl_", 24).unwrap());
    }

    /// Expected values printed by Node, the way `apps/api` hashes:
    /// `createHash('sha256').update(raw).digest('hex')`.
    #[test]
    fn hashes_exactly_as_node_does() {
        assert_eq!(
            hash("trakwyn_000102030405060708090a0b0c0d0e0f1011121314151617"),
            "95dea8f28333f6549e7ab5b85a2cdf84700c4c4b67b320a846665f52f65cecfc"
        );
        assert_eq!(
            hash("jfsl_ffeeddccbbaa99887766554433221100ffeeddccbbaa9988"),
            "50197ec14202ecd8631d9f484971cc8e7cfd8e93c405b6f4bbb1ecfe2cda778f"
        );
    }
}
