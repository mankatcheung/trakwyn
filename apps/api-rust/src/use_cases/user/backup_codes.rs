//! Issuing a fresh set of TOTP backup codes: shared by enrolment and
//! regeneration, which mint and store them identically in `apps/api`.

use super::secrets::{random_hex, sha256_hex};
use crate::use_cases::constants::totp_backup_codes::{COUNT, RANDOM_BYTES};
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ids::GenerateId;
use crate::use_cases::ports::{CreateTotpBackupCodeData, TotpBackupCodeRepository};

/// `COUNT` codes of `RANDOM_BYTES` random bytes each, hex-encoded.
pub fn generate_backup_codes() -> Vec<String> {
    (0..COUNT).map(|_| random_hex(RANDOM_BYTES)).collect()
}

/// Stores each code as its SHA-256, never the code itself.
pub async fn store_backup_codes(
    repository: &dyn TotpBackupCodeRepository,
    generate_id: &GenerateId,
    user_id: &str,
    codes: &[String],
) -> DomainResult<()> {
    for code in codes {
        repository
            .create(CreateTotpBackupCodeData {
                id: generate_id(),
                user_id: user_id.to_string(),
                code_hash: sha256_hex(code),
            })
            .await?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mints_ten_distinct_sixteen_character_hex_codes() {
        let codes = generate_backup_codes();

        assert_eq!(codes.len(), 10);
        assert!(codes.iter().all(|code| code.len() == 16));
        assert!(codes.iter().all(|code| code.bytes().all(|b| b.is_ascii_hexdigit())));
        let distinct: std::collections::HashSet<_> = codes.iter().collect();
        assert_eq!(distinct.len(), 10);
    }
}
