use crate::use_cases::errors::DomainResult;

/// Encrypts users' LLM API keys at rest.
///
/// `context` binds a ciphertext to the row it belongs to (callers pass
/// `"{user_id}:{provider}"`), so a value copied from one row to another (a
/// DB-write attacker, a bad migration) fails to decrypt instead of quietly
/// spending someone else's key. `""` is "no context", which exists only
/// because values encrypted before the binding existed carry none; new values
/// always get one.
pub trait LlmApiKeyCipher: Send + Sync {
    fn encrypt(&self, plaintext: &str, context: &str) -> DomainResult<String>;
    fn decrypt(&self, ciphertext: &str, context: &str) -> DomainResult<String>;
}
