//! The QR code shown during TOTP enrolment.
//!
//! `apps/api` renders it with `QRCode.toDataURL(otpauthUrl)` (the `qrcode`
//! npm package, all defaults): a PNG data URL at error-correction level M,
//! four pixels per module, with a four-module quiet zone. This produces the
//! same kind of image with the same parameters. The pixels are not
//! byte-identical (the two encoders are free to pick different masks and PNG
//! compression), which does not matter: the image is only displayed, and what
//! an authenticator reads out of it is the same URL.

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use qrcode::{Color, EcLevel, QrCode};

use crate::use_cases::errors::{DomainError, DomainResult};

const PIXELS_PER_MODULE: usize = 4;
const QUIET_ZONE_MODULES: usize = 4;
const DARK: u8 = 0x00;
const LIGHT: u8 = 0xff;
const DATA_URL_PREFIX: &str = "data:image/png;base64,";

/// A `data:image/png;base64,…` URL of a QR code encoding `text`.
pub fn qr_code_data_url(text: &str) -> DomainResult<String> {
    let code = QrCode::with_error_correction_level(text.as_bytes(), EcLevel::M)
        .map_err(DomainError::internal)?;
    let modules = code.width();
    let colors = code.to_colors();
    let size = (modules + 2 * QUIET_ZONE_MODULES) * PIXELS_PER_MODULE;

    let mut pixels = vec![LIGHT; size * size];
    for (index, color) in colors.iter().enumerate() {
        if *color != Color::Dark {
            continue;
        }
        let left = (index % modules + QUIET_ZONE_MODULES) * PIXELS_PER_MODULE;
        let top = (index / modules + QUIET_ZONE_MODULES) * PIXELS_PER_MODULE;
        for row in top..top + PIXELS_PER_MODULE {
            pixels[row * size + left..row * size + left + PIXELS_PER_MODULE].fill(DARK);
        }
    }

    let dimension = u32::try_from(size).map_err(DomainError::internal)?;
    let mut png_bytes = Vec::new();
    {
        let mut encoder = png::Encoder::new(&mut png_bytes, dimension, dimension);
        encoder.set_color(png::ColorType::Grayscale);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(DomainError::internal)?;
        writer.write_image_data(&pixels).map_err(DomainError::internal)?;
    }
    Ok(format!("{DATA_URL_PREFIX}{}", STANDARD.encode(png_bytes)))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// What `TotpProvider.getOtpauthUrl` returns in `apps/api` for the RFC
    /// 6238 key and `user@example.com`. `QRCode.toDataURL` of it there is a
    /// `data:image/png;base64,` URL of a 196 × 196 PNG: a version 6 symbol
    /// (41 modules) at level M, plus the quiet zone, at 4 px per module.
    const OTPAUTH_URL: &str =
        "otpauth://totp/Trakwyn:user%40example.com?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=Trakwyn";
    const NODE_PNG_SIZE: u32 = 196;

    fn decode_png(data_url: &str) -> (png::OutputInfo, Vec<u8>) {
        let encoded = data_url.strip_prefix("data:image/png;base64,").unwrap();
        let bytes = STANDARD.decode(encoded).unwrap();
        let mut reader = png::Decoder::new(bytes.as_slice()).read_info().unwrap();
        let mut pixels = vec![0; reader.output_buffer_size()];
        let info = reader.next_frame(&mut pixels).unwrap();
        pixels.truncate(info.buffer_size());
        (info, pixels)
    }

    #[test]
    fn is_a_png_data_url_of_the_size_apps_api_renders() {
        let (info, _) = decode_png(&qr_code_data_url(OTPAUTH_URL).unwrap());

        assert_eq!((info.width, info.height), (NODE_PNG_SIZE, NODE_PNG_SIZE));
    }

    #[test]
    fn a_scanner_reads_the_otpauth_url_back_out() {
        let (info, pixels) = decode_png(&qr_code_data_url(OTPAUTH_URL).unwrap());
        let width = info.width as usize;

        let mut image =
            rqrr::PreparedImage::prepare_from_greyscale(width, info.height as usize, |x, y| {
                pixels[y * width + x]
            });
        let grids = image.detect_grids();
        assert_eq!(grids.len(), 1);
        let (_, content) = grids[0].decode().unwrap();

        assert_eq!(content, OTPAUTH_URL);
    }

    #[test]
    fn has_a_quiet_zone_on_every_side() {
        let (info, pixels) = decode_png(&qr_code_data_url(OTPAUTH_URL).unwrap());
        let size = info.width as usize;
        let margin = QUIET_ZONE_MODULES * PIXELS_PER_MODULE;

        for y in 0..size {
            for x in 0..size {
                let inside =
                    (margin..size - margin).contains(&x) && (margin..size - margin).contains(&y);
                if !inside {
                    assert_eq!(pixels[y * size + x], LIGHT, "({x}, {y})");
                }
            }
        }
        // The top-left finder pattern starts right where the quiet zone ends.
        assert_eq!(pixels[margin * size + margin], DARK);
    }

    #[test]
    fn refuses_text_too_long_for_a_qr_code() {
        assert!(qr_code_data_url(&"x".repeat(4000)).is_err());
    }
}
