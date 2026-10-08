//! The HTML of every templated email. Users receive these, so each one
//! renders byte for byte what `apps/api`'s template of the same name does.
//!
//! Values are interpolated without HTML-escaping, as in `apps/api`.

mod backup_email_verification;
mod email_verification;
mod new_device_login_alert;
mod password_reset;
mod weekly_digest;

pub use backup_email_verification::build_backup_email_verification_html;
pub use email_verification::build_email_verification_html;
pub use new_device_login_alert::{build_new_device_login_alert_html, MissingWebAppOrigin};
pub use password_reset::build_password_reset_html;
pub use weekly_digest::build_weekly_digest_html;

#[cfg(test)]
pub(super) mod test_support {
    use chrono::{DateTime, Utc};
    use sha2::{Digest, Sha256};

    pub fn sha256_hex(text: &str) -> String {
        hex::encode(Sha256::digest(text.as_bytes()))
    }

    pub fn at(iso: &str) -> DateTime<Utc> {
        DateTime::parse_from_rfc3339(iso).unwrap().with_timezone(&Utc)
    }
}
