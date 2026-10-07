//! Encoding and signing primitives shared by the stateless signed values
//! (OAuth state, mobile handoff codes, MCP consent tokens), matching what
//! `apps/api` does with Node's `Buffer` and `crypto.createHmac`.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use hmac::{Hmac, Mac};
use rand::rngs::OsRng;
use rand::RngCore;
use sha2::Sha256;
use subtle::ConstantTimeEq;

/// `Buffer.from(input).toString('base64url')`: URL-safe alphabet, no padding.
pub(crate) fn base64url(input: impl AsRef<[u8]>) -> String {
    URL_SAFE_NO_PAD.encode(input)
}

/// `Buffer.from(input, 'base64')` (and `'base64url'`, which Node decodes the
/// same way): either alphabet, padding optional, anything outside the
/// alphabet skipped, and decoding stops at the first `=`. It never fails; a
/// string with nothing decodable in it is an empty buffer.
pub(crate) fn decode_base64_lenient(input: &str) -> Vec<u8> {
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut buffer: u32 = 0;
    let mut bits = 0;
    for byte in input.bytes() {
        let sextet = match byte {
            b'A'..=b'Z' => byte - b'A',
            b'a'..=b'z' => byte - b'a' + 26,
            b'0'..=b'9' => byte - b'0' + 52,
            b'+' | b'-' => 62,
            b'/' | b'_' => 63,
            b'=' => break,
            _ => continue,
        };
        buffer = (buffer << 6) | u32::from(sextet);
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            // Truncation is the point: the low eight bits above `bits`.
            out.push((buffer >> bits) as u8);
        }
    }
    out
}

/// `createHmac('sha256', secret).update(message).digest('base64url')`.
pub(crate) fn hmac_sha256_base64url(secret: &str, message: &str) -> String {
    // HMAC accepts a key of any length, the empty one included, so this
    // cannot fail; the fallback keeps the function total without a panic.
    let Ok(mut mac) = Hmac::<Sha256>::new_from_slice(secret.as_bytes()) else {
        return String::new();
    };
    mac.update(message.as_bytes());
    base64url(mac.finalize().into_bytes())
}

/// Whether two byte strings are equal, without the comparison's duration
/// depending on where they first differ.
pub(crate) fn constant_time_eq(left: &[u8], right: &[u8]) -> bool {
    left.len() == right.len() && bool::from(left.ct_eq(right))
}

pub(crate) fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

/// `randomBytes(16).toString('hex')`.
pub(crate) fn random_nonce() -> String {
    hex::encode(random_bytes::<16>())
}

/// The first two `.`-separated segments, as `const [a, b] = value.split('.')`
/// takes them: anything after a second `.` is ignored, and a missing or empty
/// segment is `None`.
pub(crate) fn split_signed(value: &str) -> Option<(&str, &str)> {
    let mut segments = value.split('.');
    let payload = segments.next().filter(|segment| !segment.is_empty())?;
    let signature = segments.next().filter(|segment| !segment.is_empty())?;
    Some((payload, signature))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base64url_has_no_padding_and_uses_the_url_alphabet() {
        assert_eq!(base64url([0xfb, 0xff]), "-_8");
    }

    #[test]
    fn lenient_decoding_accepts_either_alphabet_with_or_without_padding() {
        assert_eq!(decode_base64_lenient("-_8"), vec![0xfb, 0xff]);
        assert_eq!(decode_base64_lenient("+/8="), vec![0xfb, 0xff]);
        assert_eq!(decode_base64_lenient("aGVsbG8="), b"hello");
        assert_eq!(decode_base64_lenient("aGVs bG8\n"), b"hello");
    }

    #[test]
    fn lenient_decoding_never_fails() {
        assert_eq!(decode_base64_lenient("!!!"), Vec::<u8>::new());
        assert_eq!(decode_base64_lenient(""), Vec::<u8>::new());
        // A lone trailing character carries fewer than eight bits and is dropped.
        assert_eq!(decode_base64_lenient("aGVsbG8x"), b"hello1");
        assert_eq!(decode_base64_lenient("aGVsbG8xa"), b"hello1");
    }

    /// `createHmac('sha256', 'test-secret').update('payload').digest('base64url')` in Node.
    #[test]
    fn the_hmac_matches_nodes() {
        assert_eq!(
            hmac_sha256_base64url("test-secret", "payload"),
            "L80NvETV3Qc-rV6ktNgc_VQ-XeQunDU_gEUnFeK1dqM"
        );
    }

    /// `Buffer.from('ab=cd', 'base64')` is the single byte `0x69` in Node:
    /// nothing after the padding character is read.
    #[test]
    fn lenient_decoding_stops_at_padding() {
        assert_eq!(decode_base64_lenient("ab=cd"), vec![0x69]);
        assert_eq!(decode_base64_lenient("a!b@c#d"), vec![0x69, 0xb7, 0x1d]);
    }

    #[test]
    fn splits_like_a_destructured_js_split() {
        assert_eq!(split_signed("a.b"), Some(("a", "b")));
        assert_eq!(split_signed("a.b.c"), Some(("a", "b")));
        assert_eq!(split_signed("a"), None);
        assert_eq!(split_signed("a."), None);
        assert_eq!(split_signed(".b"), None);
        assert_eq!(split_signed(""), None);
    }

    #[test]
    fn compares_lengths_before_bytes() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"abcd"));
    }

    #[test]
    fn a_nonce_is_32_hex_characters() {
        let nonce = random_nonce();
        assert_eq!(nonce.len(), 32);
        assert!(nonce.bytes().all(|b| b.is_ascii_hexdigit()));
        assert_ne!(nonce, random_nonce());
    }
}
