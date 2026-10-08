use super::qr_code::qr_code_data_url;
use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::qr_code_renderer::QrCodeRenderer;

/// Renders the PNG `apps/api` gets from `QRCode.toDataURL` (see `qr_code.rs`).
#[derive(Debug, Clone, Copy, Default)]
pub struct PngQrCodeRenderer;

impl QrCodeRenderer for PngQrCodeRenderer {
    fn to_data_url(&self, text: &str) -> DomainResult<String> {
        qr_code_data_url(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_a_png_data_url() {
        let url =
            PngQrCodeRenderer.to_data_url("otpauth://totp/Trakwyn:a%40b.c?secret=AAAA").unwrap();
        assert!(url.starts_with("data:image/png;base64,"));
    }

    #[test]
    fn fails_for_text_no_qr_code_can_hold() {
        assert!(PngQrCodeRenderer.to_data_url(&"x".repeat(4000)).is_err());
    }
}
