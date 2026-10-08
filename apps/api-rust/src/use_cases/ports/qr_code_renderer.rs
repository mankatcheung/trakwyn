use crate::use_cases::errors::DomainResult;

/// Draws the QR code an authenticator app scans during TOTP enrolment.
pub trait QrCodeRenderer: Send + Sync {
    /// A `data:image/png;base64,…` URL of a QR code encoding `text`.
    fn to_data_url(&self, text: &str) -> DomainResult<String>;
}
