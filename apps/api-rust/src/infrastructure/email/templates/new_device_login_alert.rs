use chrono::{DateTime, Utc};

/// The alert cannot be built because there is no origin to link to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, thiserror::Error)]
#[error(
    "WEB_APP_ORIGIN is not set — refusing to build a security alert email without a trustworthy link"
)]
pub struct MissingWebAppOrigin;

/// The email sent when an account is signed in to from a device it has not
/// seen before.
///
/// `web_app_origin` has no fallback on purpose. The link is the entire point
/// of the email (it is where someone goes when they think their account is
/// compromised), so a guessed origin would send them somewhere that is not
/// Trakwyn at the exact moment they most need it to be. Failing to send beats
/// sending a wrong address, and an unset variable is a deployment mistake
/// worth surfacing rather than papering over.
///
/// The time is rendered in UTC, which is the zone `apps/api` runs in.
pub fn build_new_device_login_alert_html(
    web_app_origin: Option<&str>,
    device_label: &str,
    location: Option<&str>,
    ip_address: Option<&str>,
    login_time: DateTime<Utc>,
) -> Result<String, MissingWebAppOrigin> {
    let web_app_origin =
        web_app_origin.map(str::trim).filter(|o| !o.is_empty()).ok_or(MissingWebAppOrigin)?;

    // "Thursday, August 20, 2026 at 09:00 AM UTC"
    let date_str = login_time.format("%A, %B %-d, %Y at %I:%M %p UTC");

    let location_line = match location.filter(|location| !location.is_empty()) {
        Some(location) => format!(
            r##"<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">Location: {location}</p>"##
        ),
        None => String::new(),
    };
    let ip_line = match ip_address.filter(|ip_address| !ip_address.is_empty()) {
        Some(ip_address) => format!(
            r##"<p style="margin:0 0 8px;color:#6b7280;font-size:14px;">IP: {ip_address}</p>"##
        ),
        None => String::new(),
    };

    Ok(format!(
        r##"
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:480px;margin:0 auto;padding:32px 24px;">
    <div style="background-color:#ffffff;border-radius:12px;border:1px solid #e5e7eb;padding:32px;">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:600;color:#111827;">New device signed in to your account</h1>
      <p style="margin:0 0 16px;color:#374151;font-size:15px;">
        A new device was used to sign in to your <strong>Trakwyn</strong> account.
      </p>
      <div style="background-color:#f3f4f6;border-radius:8px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 8px;font-weight:600;color:#111827;font-size:15px;">{device_label}</p>
        {location_line}
        {ip_line}
        <p style="margin:0;color:#6b7280;font-size:13px;">{date_str}</p>
      </div>
      <p style="margin:0 0 8px;color:#374151;font-size:14px;">
        If this was you, no action is needed.
      </p>
      <p style="margin:0;color:#374151;font-size:14px;">
        If you don't recognise this activity, please <a href="{web_app_origin}/settings/security" style="color:#2563eb;text-decoration:underline;">review your active sessions</a> and revoke any you don't recognise. You should also consider changing your password.
      </p>
    </div>
    <p style="margin:16px 0 0;text-align:center;color:#9ca3af;font-size:12px;">
      Trakwyn
    </p>
  </div>
</body>
</html>"##
    ))
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{at, sha256_hex};
    use super::*;

    fn build(origin: Option<&str>) -> Result<String, MissingWebAppOrigin> {
        build_new_device_login_alert_html(
            origin,
            "Chrome on macOS",
            Some("London, GB"),
            Some("203.0.113.4"),
            at("2026-08-20T09:00:00.000Z"),
        )
    }

    #[test]
    fn links_to_the_configured_origin() {
        let html = build(Some("https://www.trakwyn.com")).unwrap();
        assert!(html.contains(r#"href="https://www.trakwyn.com/settings/security""#));
    }

    #[test]
    fn includes_the_device_location_ip_and_time_so_the_reader_can_judge_it() {
        let html = build(Some("https://www.trakwyn.com")).unwrap();

        assert!(html.contains("Chrome on macOS"));
        assert!(html.contains("London, GB"));
        assert!(html.contains("203.0.113.4"));
        assert!(html.contains("Thursday, August 20, 2026 at 09:00 AM UTC"));
    }

    #[test]
    fn refuses_to_build_the_email_without_an_origin() {
        // This link is where someone goes when they think they have been
        // compromised. Guessing an origin would send them somewhere that is
        // not Trakwyn at exactly the wrong moment, so not sending is the
        // better failure.
        for origin in [None, Some(""), Some("   ")] {
            let err = build(origin).unwrap_err();
            assert!(err.to_string().starts_with("WEB_APP_ORIGIN is not set"), "{origin:?}");
        }
    }

    #[test]
    fn the_refusal_reads_exactly_as_the_original_does() {
        assert_eq!(
            MissingWebAppOrigin.to_string(),
            "WEB_APP_ORIGIN is not set — refusing to build a security alert email without a trustworthy link"
        );
    }

    #[test]
    fn never_falls_back_to_a_hardcoded_deployment_url() {
        let html = build(None).unwrap_or_default();

        assert!(!html.contains("vercel.app"));
        assert!(!html.contains("job-finder"));
    }

    #[test]
    fn leaves_out_the_location_and_ip_lines_when_they_are_unknown() {
        let html = build_new_device_login_alert_html(
            Some("https://www.trakwyn.com"),
            "Mac — Safari 17.4",
            None,
            None,
            at("2026-08-02T13:05:00.000Z"),
        )
        .unwrap();

        assert!(!html.contains("Location:"));
        assert!(!html.contains("IP:"));
        assert!(html.contains("Sunday, August 2, 2026 at 01:05 PM UTC"));
    }

    /// The hashes are of the HTML `apps/api`'s template renders for the same
    /// input (with `TZ=UTC`), so any drift in markup, whitespace or date
    /// format fails here.
    #[test]
    fn renders_the_same_bytes_as_the_original() {
        let full = build(Some("  https://www.trakwyn.com ")).unwrap();
        assert_eq!(
            sha256_hex(&full),
            "5e2aa9d43c3d1564fae8c09f7898836f3cd42c8eb1848a213f2676f2474976e7"
        );

        let bare = build_new_device_login_alert_html(
            Some("https://www.trakwyn.com"),
            "Mac — Safari 17.4",
            None,
            None,
            at("2026-08-02T13:05:00.000Z"),
        )
        .unwrap();
        assert_eq!(
            sha256_hex(&bare),
            "3e086d3c8ded16d4af4281d36c17ef2057bfbc92df2e07a5733837b19ed3d9cb"
        );

        // An empty location or IP is left out like a missing one, midnight is
        // "12", and the device label is interpolated as given.
        let midnight = build_new_device_login_alert_html(
            Some("https://www.trakwyn.com"),
            "<b>x</b>",
            Some(""),
            Some(""),
            at("2026-12-31T00:05:00.000Z"),
        )
        .unwrap();
        assert_eq!(
            sha256_hex(&midnight),
            "c890d8ba70080f8ebec750a4fe84c5b2307c48b05714c09fdc875d69f253f932"
        );
    }
}
