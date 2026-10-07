use std::fmt::Display;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;

use crate::infrastructure::auth::at_rest::AtRestKey;
use crate::infrastructure::auth::encoding::decode_base64_lenient;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::llm_api_key_cipher::LlmApiKeyCipher;

/// Key-derivation salt, NOT a label. Do not rename it.
///
/// It is an input to scrypt, so changing the string changes the derived AES
/// key and every value already encrypted with the old one stops decrypting.
/// The pre-rebrand name is deliberate dead weight: it is load-bearing
/// precisely because it is arbitrary, and it must equal `apps/api`'s
/// (`LlmApiKeyCipher.ts`), which encrypts the same column.
///
/// Renaming it makes every LLM API key users have saved unrecoverable.
const SCRYPT_SALT: &str = "job-finder-llm-api-key";

/// Ciphertext format marker. Values written before it existed are bare
/// base64 (`iv ‖ tag ‖ ciphertext`, no AAD) and still decrypt; `v1:` adds the
/// row-binding AAD. `:` is not in the base64 alphabet, so the prefix can
/// never collide with a legacy value.
const FORMAT_V1: &str = "v1:";

/// AES-256-GCM under a scrypt-derived key, interchangeable with `apps/api`'s
/// `LlmApiKeyCipher`: a key saved through either implementation decrypts in
/// the other.
pub struct AesGcmLlmApiKeyCipher {
    key: AtRestKey,
}

impl AesGcmLlmApiKeyCipher {
    /// `passphrase` is `LLM_API_KEY_ENCRYPTION_KEY`.
    pub fn new(passphrase: impl Into<String>) -> Self {
        Self { key: AtRestKey::new(passphrase, SCRYPT_SALT) }
    }

    /// Takes `LlmCipherConfig::passphrase()`. An `Err` (the key is unset, or
    /// is the placeholder in production) does not prevent construction: every
    /// encrypt or decrypt fails with that reason, as in `apps/api`, so an API
    /// without AI features configured still starts.
    pub fn from_passphrase<E: Display>(passphrase: Result<String, E>) -> Self {
        Self { key: AtRestKey::from_passphrase(passphrase, SCRYPT_SALT) }
    }
}

impl LlmApiKeyCipher for AesGcmLlmApiKeyCipher {
    fn encrypt(&self, plaintext: &str, context: &str) -> DomainResult<String> {
        let sealed = self.key.seal(plaintext.as_bytes(), context.as_bytes())?;
        Ok(format!("{FORMAT_V1}{}", STANDARD.encode(sealed)))
    }

    fn decrypt(&self, ciphertext: &str, context: &str) -> DomainResult<String> {
        // Legacy values were sealed without AAD; supplying one now would fail
        // the tag check on every key saved before this format existed.
        let (encoded, aad) = match ciphertext.strip_prefix(FORMAT_V1) {
            Some(encoded) => (encoded, context.as_bytes()),
            None => (ciphertext, &b""[..]),
        };
        let decrypted = self.key.open(&decode_base64_lenient(encoded), aad)?;
        Ok(String::from_utf8_lossy(&decrypted).into_owned())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::OnceLock;

    use super::*;
    use crate::use_cases::errors::ErrorCode;

    /// Shared so scrypt runs once for the whole module, not once per test.
    fn cipher() -> &'static AesGcmLlmApiKeyCipher {
        static CIPHER: OnceLock<AesGcmLlmApiKeyCipher> = OnceLock::new();
        CIPHER
            .get_or_init(|| AesGcmLlmApiKeyCipher::new("cross-impl-test-passphrase-not-a-real-key"))
    }

    // Output of `LlmApiKeyCipher.encrypt('sk-cross-impl-0123456789', context)`
    // in `apps/api/src/infrastructure/llm/LlmApiKeyCipher.ts`, run under `tsx`
    // with `LLM_API_KEY_ENCRYPTION_KEY=cross-impl-test-passphrase-not-a-real-key`:
    // once bound to the row `user-1:openai`, once with no context.
    const NODE_V1_WITH_CONTEXT: &str =
        "v1:WbPGLxU9S/YrrpIfjl7fzYCMzmmclO6Nmmaumm2sxH0i/axWA42E74+ixfo1wl4eSvd0mg==";
    const NODE_V1_NO_CONTEXT: &str =
        "v1:LZguhmv/SvHDWEWoM335GaaTIWu6PuyLC1DWHI9SZ1dpD0VQCkM+F+9tblha99oqzG9bFg==";
    const NODE_PLAINTEXT: &str = "sk-cross-impl-0123456789";

    #[test]
    fn decrypts_keys_encrypted_by_the_node_implementation() {
        assert_eq!(
            cipher().decrypt(NODE_V1_WITH_CONTEXT, "user-1:openai").unwrap(),
            NODE_PLAINTEXT
        );
        assert_eq!(cipher().decrypt(NODE_V1_NO_CONTEXT, "").unwrap(), NODE_PLAINTEXT);
    }

    #[test]
    fn refuses_a_node_ciphertext_moved_to_another_row() {
        // `decrypt(ciphertext, 'user-2:openai')` throws in apps/api too
        // ("Unsupported state or unable to authenticate data").
        assert!(cipher().decrypt(NODE_V1_WITH_CONTEXT, "user-2:openai").is_err());
        assert!(cipher().decrypt(NODE_V1_WITH_CONTEXT, "").is_err());
        assert!(cipher().decrypt(NODE_V1_NO_CONTEXT, "user-1:openai").is_err());
    }

    /// The fixture `apps/api`'s `scryptSaltsArePinned.test.ts` and
    /// `LlmApiKeyCipher.test.ts` pin: a value sealed by the pre-`v1:`
    /// implementation under the passphrase `salt-pinning-test-passphrase`. It
    /// proves both the salt and the legacy (no prefix, no AAD) format.
    #[test]
    fn still_decrypts_values_sealed_before_the_format_existed_ignoring_any_context() {
        let cipher = AesGcmLlmApiKeyCipher::new("salt-pinning-test-passphrase");
        let legacy = "1e8uZytALIwIO+uow3pnq54S1L3u7xiARD1HzAPrhmag3Z90mE0LWfIhzdvQ7g==";

        assert_eq!(cipher.decrypt(legacy, "").unwrap(), "sk-test-0123456789");
        assert_eq!(cipher.decrypt(legacy, "user-1:openai").unwrap(), "sk-test-0123456789");
    }

    #[test]
    fn decrypts_back_to_the_original_plaintext() {
        let encrypted = cipher().encrypt("sk-or-v1-abc123", "").unwrap();
        assert_eq!(cipher().decrypt(&encrypted, "").unwrap(), "sk-or-v1-abc123");
    }

    #[test]
    fn does_not_store_the_plaintext_key_in_the_ciphertext() {
        assert!(!cipher().encrypt("sk-or-v1-abc123", "").unwrap().contains("sk-or-v1-abc123"));
    }

    #[test]
    fn produces_different_ciphertext_for_the_same_plaintext_on_each_call() {
        let first = cipher().encrypt("sk-or-v1-abc123", "").unwrap();
        let second = cipher().encrypt("sk-or-v1-abc123", "").unwrap();

        assert_ne!(first, second);
        assert_eq!(cipher().decrypt(&first, "").unwrap(), "sk-or-v1-abc123");
        assert_eq!(cipher().decrypt(&second, "").unwrap(), "sk-or-v1-abc123");
    }

    #[test]
    fn marks_new_ciphertexts_with_a_format_version_in_the_node_layout() {
        let encrypted = cipher().encrypt(NODE_PLAINTEXT, "user-1:openai").unwrap();

        let encoded = encrypted.strip_prefix("v1:").unwrap();
        assert!(encoded.bytes().all(|b| b.is_ascii_alphanumeric() || b"+/=".contains(&b)));
        // Standard padded base64 of `iv(12) ‖ tag(16) ‖ ciphertext`, exactly
        // as long as what Node wrote for the same plaintext.
        assert_eq!(encrypted.len(), NODE_V1_WITH_CONTEXT.len());
        assert_eq!(STANDARD.decode(encoded).unwrap().len(), 12 + 16 + NODE_PLAINTEXT.len());
    }

    #[test]
    fn fails_when_the_ciphertext_has_been_tampered_with() {
        let encrypted = cipher().encrypt("sk-or-v1-abc123", "").unwrap();
        let mut bytes = STANDARD.decode(&encrypted[3..]).unwrap();
        *bytes.last_mut().unwrap() ^= 0xff;
        let tampered = format!("v1:{}", STANDARD.encode(bytes));

        let err = cipher().decrypt(&tampered, "").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
    }

    #[test]
    fn decrypts_with_the_context_it_was_sealed_under() {
        let encrypted = cipher().encrypt("sk-1", "user-1:openai").unwrap();
        assert_eq!(cipher().decrypt(&encrypted, "user-1:openai").unwrap(), "sk-1");
    }

    #[test]
    fn refuses_a_ciphertext_moved_to_another_row() {
        let encrypted = cipher().encrypt("sk-1", "user-1:openai").unwrap();

        assert!(cipher().decrypt(&encrypted, "user-2:openai").is_err());
        assert!(cipher().decrypt(&encrypted, "").is_err());
    }

    #[test]
    fn stripping_the_version_prefix_does_not_bypass_the_row_binding() {
        // Read as a legacy value, a v1 ciphertext is checked with no AAD and
        // so fails unless it was sealed with none.
        let encrypted = cipher().encrypt("sk-1", "user-1:openai").unwrap();
        assert!(cipher().decrypt(&encrypted[3..], "user-2:openai").is_err());
    }

    #[test]
    fn fails_under_another_passphrase() {
        let other = AesGcmLlmApiKeyCipher::new("another-passphrase-not-real");
        assert!(other.decrypt(NODE_V1_NO_CONTEXT, "").is_err());
    }

    #[test]
    fn fails_with_the_reason_when_the_key_is_not_usable() {
        let cipher = AesGcmLlmApiKeyCipher::from_passphrase(Err::<String, _>(
            "LLM_API_KEY_ENCRYPTION_KEY must be set",
        ));

        let err = cipher.encrypt("sk-or-v1-abc123", "").unwrap_err();
        assert_eq!(err.code(), ErrorCode::InternalError);
        assert!(err.to_string().contains("LLM_API_KEY_ENCRYPTION_KEY"));
        assert!(cipher.decrypt(NODE_V1_NO_CONTEXT, "").is_err());
    }

    #[test]
    fn is_built_from_the_configuration() {
        use crate::config::llm::LlmCipherConfig;

        let lookup = |name: &str| {
            (name == "LLM_API_KEY_ENCRYPTION_KEY")
                .then(|| "cross-impl-test-passphrase-not-a-real-key".to_string())
        };
        let config = LlmCipherConfig::from_lookup(&lookup).unwrap();
        let cipher = AesGcmLlmApiKeyCipher::from_passphrase(config.passphrase());
        assert_eq!(cipher.decrypt(NODE_V1_NO_CONTEXT, "").unwrap(), NODE_PLAINTEXT);

        let placeholder = |name: &str| match name {
            "LLM_API_KEY_ENCRYPTION_KEY" => Some("change-me-in-production".to_string()),
            "NODE_ENV" => Some("production".to_string()),
            _ => None,
        };
        let config = LlmCipherConfig::from_lookup(&placeholder).unwrap();
        let err = AesGcmLlmApiKeyCipher::from_passphrase(config.passphrase())
            .encrypt("sk-1", "")
            .unwrap_err();
        assert!(err.to_string().contains("placeholder"));
    }
}
