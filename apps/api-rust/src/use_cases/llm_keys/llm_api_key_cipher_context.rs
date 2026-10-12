/// The context both sides of `LlmApiKeyCipher` agree on: a key is sealed to
/// the (user, provider) row it lives in, so the same ciphertext pasted into
/// another row fails to decrypt rather than spending someone else's key.
/// One function so the two callers cannot drift apart.
pub fn llm_api_key_cipher_context(user_id: &str, provider: &str) -> String {
    format!("{user_id}:{provider}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binds_the_user_and_the_provider() {
        assert_eq!(llm_api_key_cipher_context("user-1", "openai"), "user-1:openai");
    }
}
