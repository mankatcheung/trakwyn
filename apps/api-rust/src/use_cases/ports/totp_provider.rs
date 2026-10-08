use crate::use_cases::errors::DomainResult;

pub trait TotpProvider: Send + Sync {
    /// Generates a new random base32 TOTP secret.
    fn generate_secret(&self) -> String;

    /// Builds the `otpauth://` URI (for QR-code display) for a secret/account label.
    fn get_otpauth_url(&self, secret: &str, label: &str) -> DomainResult<String>;

    /// Verifies a 6-digit code against a secret, allowing a small clock-drift window.
    ///
    /// `Ok(false)` is a well-formed code that does not match. A code that is
    /// not six digits, or a secret that is not usable, is an error (as it is
    /// in `apps/api`, where the TOTP library throws): callers check the shape
    /// of the code first.
    fn verify_code(&self, secret: &str, code: &str) -> DomainResult<bool>;

    /// Encrypts a raw secret for storage at rest.
    fn encrypt_secret(&self, secret: &str) -> DomainResult<String>;

    /// Decrypts a secret previously produced by [`TotpProvider::encrypt_secret`].
    fn decrypt_secret(&self, encrypted_secret: &str) -> DomainResult<String>;
}
