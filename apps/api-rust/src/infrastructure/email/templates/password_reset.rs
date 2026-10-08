/// The password-reset email.
///
/// The URL is interpolated as given, exactly as `apps/api` does: the caller
/// builds it from the web app's origin and a token it generated.
pub fn build_password_reset_html(reset_url: &str) -> String {
    format!(
        r##"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:32px 32px 24px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Reset your password</h1>
    </div>

    <!-- Body -->
    <div style="padding:32px;">
      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.5;">
        We received a request to reset the password for your Trakwyn account. Click the
        button below to choose a new password. This link expires in 1 hour.
      </p>
      <p style="margin:0 0 28px;text-align:center;">
        <a href="{reset_url}" style="display:inline-block;background:#2563eb;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">
          Reset password
        </a>
      </p>
      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">
        If you didn't request this, you can safely ignore this email — your password won't be
        changed.
      </p>
    </div>
  </div>
</body>
</html>"##
    )
}

#[cfg(test)]
mod tests {
    use super::super::test_support::sha256_hex;
    use super::*;

    const RESET_URL: &str = "https://app.jobfinder.com/reset-password?token=abc123";

    #[test]
    fn includes_the_reset_url_as_the_button_link() {
        let html = build_password_reset_html(RESET_URL);

        assert!(html.contains(r#"href="https://app.jobfinder.com/reset-password?token=abc123""#));
    }

    #[test]
    fn mentions_the_1_hour_expiry_and_includes_safe_to_ignore_copy() {
        let html = build_password_reset_html(RESET_URL);

        assert!(html.contains("expires in 1 hour"));
        assert!(html.contains("you can safely ignore this email"));
    }

    /// The hash is of the HTML `apps/api`'s template renders for this URL.
    #[test]
    fn renders_the_same_bytes_as_the_original() {
        assert_eq!(
            sha256_hex(&build_password_reset_html(RESET_URL)),
            "7646c7a3088335ba522d9667c7291bb9de346d7a2de3f7e41d09f577ee184e52"
        );
    }
}
