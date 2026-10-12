use crate::use_cases::errors::DomainResult;
use crate::use_cases::ports::qr_code_renderer::QrCodeRenderer;

/// "Renders" a recognisable string built from the text: `fake-qr:<text>`.
#[derive(Default)]
pub struct FakeQrCodeRenderer;

impl QrCodeRenderer for FakeQrCodeRenderer {
    fn to_data_url(&self, text: &str) -> DomainResult<String> {
        Ok(format!("fake-qr:{text}"))
    }
}
