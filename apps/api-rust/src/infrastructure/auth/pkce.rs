//! PKCE (RFC 7636) for the flows where trakwyn is the *client*: signing in
//! with Google or GitHub.
//!
//! The verifier stays on this server; only its SHA-256 hash travels through
//! the browser as the challenge. So an attacker who captures the whole
//! callback URL still cannot redeem the code, which is what protects against
//! authorization code injection (JEF-200).
//!
//! This runs the opposite direction to the two places trakwyn is instead the
//! authorization server *verifying* a challenge someone else minted: the MCP
//! OAuth code exchange and the mobile OAuth handoff. `is_well_formed_pkce_value`
//! is shared with both.

use sha2::{Digest, Sha256};

use crate::infrastructure::auth::encoding::{base64url, random_bytes};

/// 32 random bytes → 43 base64url characters, inside RFC 7636's 43–128 range.
const VERIFIER_BYTES: usize = 32;

const MIN_LENGTH: usize = 43;
const MAX_LENGTH: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
}

pub fn derive_code_challenge(verifier: &str) -> String {
    base64url(Sha256::digest(verifier.as_bytes()))
}

pub fn create_pkce_pair() -> PkcePair {
    // base64url, so the result is already unreserved characters only: no
    // percent-encoding in the query string, and no '.' to collide with the
    // separator the state cookie uses.
    let verifier = base64url(random_bytes::<VERIFIER_BYTES>());
    let challenge = derive_code_challenge(&verifier);
    PkcePair { verifier, challenge }
}

/// RFC 7636 s4.1: 43-128 characters from the unreserved set (restricted here
/// to base64url's subset of it).
pub fn is_well_formed_pkce_value(value: &str) -> bool {
    (MIN_LENGTH..=MAX_LENGTH).contains(&value.len())
        && value.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `deriveCodeChallenge` from `apps/api/src/infrastructure/auth/pkce.ts`,
    /// run under `tsx`, for the RFC 7636 appendix B verifier (whose published
    /// challenge this is) and for the string the TypeScript suite uses.
    #[test]
    fn derives_the_challenge_apps_api_derives() {
        assert_eq!(
            derive_code_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
        assert_eq!(
            derive_code_challenge("a-fixed-verifier"),
            "F_9eVVsfKKbQg_1eD12n5PWP0NFYNc3ONichZ4uWDOI"
        );
    }

    #[test]
    fn the_challenge_is_the_base64url_sha256_of_the_verifier() {
        let pair = create_pkce_pair();
        assert_eq!(pair.challenge, base64url(Sha256::digest(pair.verifier.as_bytes())));
    }

    #[test]
    fn produces_a_verifier_within_the_length_rfc_7636_allows() {
        let pair = create_pkce_pair();
        assert_eq!(pair.verifier.len(), 43);
        assert!(is_well_formed_pkce_value(&pair.verifier));
        assert!(is_well_formed_pkce_value(&pair.challenge));
    }

    #[test]
    fn never_contains_a_dot_which_the_cookie_uses_as_its_separator() {
        // The state nonce and the verifier share one cookie, split on '.'.
        for _ in 0..50 {
            assert!(!create_pkce_pair().verifier.contains('.'));
        }
    }

    #[test]
    fn mints_a_different_pair_every_time() {
        assert_ne!(create_pkce_pair().verifier, create_pkce_pair().verifier);
    }

    #[test]
    fn well_formedness_is_length_and_alphabet() {
        assert!(is_well_formed_pkce_value(&"a".repeat(43)));
        assert!(is_well_formed_pkce_value(&"a".repeat(128)));
        assert!(is_well_formed_pkce_value(&"aZ09-_".repeat(8)));

        assert!(!is_well_formed_pkce_value(&"a".repeat(42)));
        assert!(!is_well_formed_pkce_value(&"a".repeat(129)));
        assert!(!is_well_formed_pkce_value("too-short"));
        assert!(!is_well_formed_pkce_value(""));
        // Unreserved in RFC 7636, but outside base64url: refused, as in apps/api.
        assert!(!is_well_formed_pkce_value(&format!("{}.", "a".repeat(43))));
        assert!(!is_well_formed_pkce_value(&format!("{}~", "a".repeat(43))));
        assert!(!is_well_formed_pkce_value(&format!("{}\n", "a".repeat(43))));
        assert!(!is_well_formed_pkce_value(&"é".repeat(43)));
    }
}
