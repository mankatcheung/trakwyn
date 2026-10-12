//! bcrypt, as `apps/api` uses it through `bcryptjs`: both implementations
//! read and write `User.passwordHash`, so each must verify the other's.
//!
//! bcrypt is deliberately slow, so it runs off the async workers.

use crate::use_cases::constants::password::BCRYPT_COST;
use crate::use_cases::errors::{DomainError, DomainResult};

/// Every bcrypt hash is this long; `bcryptjs.compare` answers `false` for
/// anything else without trying.
const BCRYPT_HASH_LENGTH: usize = 60;

/// `bcrypt.compare(password, hash)`.
///
/// A stored value that is not 60 characters long never matches. One that is
/// but is not a bcrypt hash is an error, as it is in `bcryptjs`.
pub async fn verify_password(password: &str, hash: &str) -> DomainResult<bool> {
    if hash.len() != BCRYPT_HASH_LENGTH {
        return Ok(false);
    }
    let (password, hash) = (password.to_string(), hash.to_string());
    tokio::task::spawn_blocking(move || bcrypt::verify(password, &hash))
        .await
        .map_err(DomainError::internal)?
        .map_err(DomainError::internal)
}

/// `bcrypt.hash(password, 12)`.
pub async fn hash_password(password: &str) -> DomainResult<String> {
    hash_password_with_cost(password, BCRYPT_COST).await
}

pub async fn hash_password_with_cost(password: &str, cost: u32) -> DomainResult<String> {
    let password = password.to_string();
    tokio::task::spawn_blocking(move || bcrypt::hash(password, cost))
        .await
        .map_err(DomainError::internal)?
        .map_err(DomainError::internal)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `bcryptjs@3.0.3`: `bcrypt.hashSync('correct horse battery staple', 12)`.
    const NODE_HASH: &str = "$2b$12$/2O8nGBuJDIB5CZeOt1xeOUoTFvOBb4R597fjwAcsUhxO/pmCplEe";
    /// `bcrypt.hashSync('pässwörd-✓', 12)`.
    const NODE_UNICODE_HASH: &str = "$2b$12$qHm98frbnPL/Jeh0x2ERtepD0xt9JeRohccnlMfMLmnWPxGkCnsOO";

    #[tokio::test]
    async fn verifies_a_hash_written_by_bcryptjs() {
        assert!(verify_password("correct horse battery staple", NODE_HASH).await.unwrap());
        assert!(!verify_password("correct horse battery stapl", NODE_HASH).await.unwrap());
    }

    #[tokio::test]
    async fn verifies_a_non_ascii_password_hashed_by_bcryptjs() {
        assert!(verify_password("pässwörd-✓", NODE_UNICODE_HASH).await.unwrap());
        assert!(!verify_password("password-✓", NODE_UNICODE_HASH).await.unwrap());
    }

    #[tokio::test]
    async fn writes_a_cost_12_hash_in_the_format_bcryptjs_writes() {
        let hash = hash_password("hunter2hunter2").await.unwrap();

        // A hash printed from here was checked the other way round:
        // `bcryptjs.compareSync` accepts it for the same password.
        assert_eq!(hash.len(), BCRYPT_HASH_LENGTH);
        assert!(hash.starts_with("$2b$12$"), "{hash}");
        assert!(verify_password("hunter2hunter2", &hash).await.unwrap());
    }

    #[tokio::test]
    async fn a_value_that_is_not_60_characters_never_matches() {
        assert!(!verify_password("x", "hashed").await.unwrap());
        assert!(!verify_password("", "").await.unwrap());
    }

    #[tokio::test]
    async fn a_60_character_value_that_is_not_a_hash_is_an_error() {
        assert!(verify_password("x", &"x".repeat(BCRYPT_HASH_LENGTH)).await.is_err());
    }

    #[tokio::test]
    async fn only_the_first_72_bytes_count_as_in_bcryptjs() {
        let hash = hash_password_with_cost(&"a".repeat(80), 4).await.unwrap();

        assert!(verify_password(&"a".repeat(72), &hash).await.unwrap());
        assert!(!verify_password(&"a".repeat(71), &hash).await.unwrap());
    }
}
