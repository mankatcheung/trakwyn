//! bcrypt, the way `apps/api` uses `bcryptjs`: the two implementations share
//! one `User.passwordHash` column, so a hash written by either must verify in
//! the other.
//!
//! bcrypt is deliberately slow, so both operations run on the blocking pool
//! rather than stalling the async workers.

use crate::use_cases::constants::password::BCRYPT_COST;
use crate::use_cases::errors::{DomainError, DomainResult};

/// Every bcrypt hash is exactly this long. `bcryptjs` answers "no match" for
/// anything else instead of failing, and so does [`verify_password`].
const BCRYPT_HASH_LENGTH: usize = 60;

async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, bcrypt::BcryptError> + Send + 'static,
) -> DomainResult<T> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(DomainError::internal)?
        .map_err(DomainError::internal)
}

/// Hashes a password at the cost `apps/api` uses.
pub async fn hash_password(password: &str) -> DomainResult<String> {
    hash_password_with_cost(password, BCRYPT_COST).await
}

pub(crate) async fn hash_password_with_cost(password: &str, cost: u32) -> DomainResult<String> {
    let password = password.to_string();
    blocking(move || bcrypt::hash(password, cost)).await
}

/// Whether `password` is the one `hash` was made from. The cost is read from
/// the hash itself. A stored value that is not a bcrypt hash at all is a
/// mismatch when it has the wrong length, and a failure otherwise, as it is
/// in `bcryptjs`.
pub async fn verify_password(password: &str, hash: &str) -> DomainResult<bool> {
    if hash.encode_utf16().count() != BCRYPT_HASH_LENGTH {
        return Ok(false);
    }
    let (password, hash) = (password.to_string(), hash.to_string());
    blocking(move || bcrypt::verify(password, &hash)).await
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `bcryptjs@3` output for `bcrypt.hashSync('correct horse battery', 12)`.
    const BCRYPTJS_HASH: &str = "$2b$12$lQWwQjG7UpSu3o6oDMQnBeUJcPtVDxKWUUZjrTxiAZHk2l8KSjHVS";
    const BCRYPTJS_PASSWORD: &str = "correct horse battery";

    #[tokio::test]
    async fn verifies_a_hash_written_by_bcryptjs() {
        assert!(verify_password(BCRYPTJS_PASSWORD, BCRYPTJS_HASH).await.unwrap());
        assert!(!verify_password("correct horse batterz", BCRYPTJS_HASH).await.unwrap());
    }

    #[tokio::test]
    async fn hashes_at_cost_twelve_in_the_format_bcryptjs_reads() {
        let hash = hash_password("hunter2hunter2").await.unwrap();

        assert_eq!(hash.len(), BCRYPT_HASH_LENGTH);
        assert!(hash.starts_with("$2b$12$"), "{hash}");
        assert!(verify_password("hunter2hunter2", &hash).await.unwrap());
    }

    #[tokio::test]
    async fn two_hashes_of_one_password_differ_by_their_salt() {
        let first = hash_password_with_cost("same password", 4).await.unwrap();
        let second = hash_password_with_cost("same password", 4).await.unwrap();

        assert_ne!(first, second);
    }

    #[tokio::test]
    async fn a_value_of_the_wrong_length_is_a_mismatch_not_a_failure() {
        assert!(!verify_password("anything", "hashed").await.unwrap());
        assert!(!verify_password("anything", "").await.unwrap());
    }

    #[tokio::test]
    async fn a_sixty_character_value_that_is_not_a_hash_is_a_failure() {
        let not_a_hash = "x".repeat(BCRYPT_HASH_LENGTH);
        assert!(verify_password("anything", &not_a_hash).await.is_err());
    }

    #[tokio::test]
    async fn only_the_first_seventy_two_bytes_count() {
        // bcrypt reads 72 bytes of key; bcryptjs and this crate both ignore the rest.
        let long = "a".repeat(80);
        let hash = hash_password_with_cost(&long, 4).await.unwrap();

        assert!(verify_password(&"a".repeat(72), &hash).await.unwrap());
        assert!(!verify_password(&"a".repeat(71), &hash).await.unwrap());
    }
}
