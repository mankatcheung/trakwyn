use crate::use_cases::ports::{DigestFrequency, WeeklyDigestData};

/// The label shown for a status, or `None` for one this template does not
/// know, which is then shown as it is spelled.
fn status_label(status: &str) -> Option<&'static str> {
    Some(match status {
        "draft" => "Draft",
        "applied" => "Applied",
        "interviewing" => "Interviewing",
        "offered" => "Offered",
        "accepted" => "Accepted",
        "rejected" => "Rejected",
        "withdrawn" => "Withdrawn",
        _ => return None,
    })
}

/// The daily or weekly digest. Dates are rendered in UTC, which is the zone
/// `apps/api` runs in.
pub fn build_weekly_digest_html(
    data: &WeeklyDigestData,
    period_label: &str,
    frequency: DigestFrequency,
) -> String {
    let (period, title) = match frequency {
        DigestFrequency::Daily => ("today", "Daily"),
        DigestFrequency::Weekly => ("this week", "Weekly"),
    };

    let status_rows: String = data
        .by_status
        .iter()
        .filter(|(_, count)| *count > 0)
        .map(|(status, count)| {
            let label = status_label(status).unwrap_or(status);
            format!(
                r##"<tr>
          <td style="padding:6px 0;color:#374151;">{label}</td>
          <td style="padding:6px 0;text-align:right;font-weight:600;color:#111827;">{count}</td>
        </tr>"##
            )
        })
        .collect();

    let new_apps_html: String = if data.new_this_week.is_empty() {
        format!(
            r##"<p style="color:#9ca3af;font-size:14px;margin:0;">No new applications {period}.</p>"##
        )
    } else {
        data.new_this_week
            .iter()
            .map(|a| {
                let (company, role) = (&a.company, &a.role);
                format!(
                    r##"<div style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
            <span style="font-weight:600;color:#111827;">{company}</span>
            <span style="color:#6b7280;margin-left:6px;">— {role}</span>
          </div>"##
                )
            })
            .collect()
    };

    // Only rendered inside the overdue block, which is itself left out when
    // the list is empty; `apps/api` has an unreachable "No overdue
    // follow-ups" line for that case.
    let overdue_html: String = data
        .overdue_follow_ups
        .iter()
        .map(|a| {
            let (company, role) = (&a.company, &a.role);
            let due = a.follow_up_at.format("%b %-d");
            format!(
                r##"<div style="padding:8px 0;border-bottom:1px solid #fef2f2;">
            <span style="font-weight:600;color:#111827;">{company}</span>
            <span style="color:#6b7280;margin-left:6px;">— {role}</span>
            <span style="color:#ef4444;font-size:12px;margin-left:8px;">Due {due}</span>
          </div>"##
            )
        })
        .collect();

    let upcoming_html: String = if data.upcoming_follow_ups.is_empty() {
        format!(
            r##"<p style="color:#9ca3af;font-size:14px;margin:0;">No upcoming follow-ups {period}.</p>"##
        )
    } else {
        data.upcoming_follow_ups
            .iter()
            .map(|a| {
                let (company, role) = (&a.company, &a.role);
                let due = a.follow_up_at.format("%a, %b %-d");
                format!(
                    r##"<div style="padding:8px 0;border-bottom:1px solid #f0fdf4;">
            <span style="font-weight:600;color:#111827;">{company}</span>
            <span style="color:#6b7280;margin-left:6px;">— {role}</span>
            <span style="color:#16a34a;font-size:12px;margin-left:8px;">{due}</span>
          </div>"##
                )
            })
            .collect()
    };

    let goal_html = match data.weekly_application_goal {
        None => String::new(),
        Some(goal) => {
            let current = data.current_week_application_count.unwrap_or(0);
            let streak = data.application_streak_weeks.unwrap_or(0);
            let plural = if streak == 1 { "" } else { "s" };
            format!(
                r##"<div style="padding:24px 32px;border-bottom:1px solid #f3f4f6;background:#eff6ff;">
       <h2 style="margin:0 0 8px;font-size:15px;font-weight:600;color:#1e3a8a;">Weekly application goal</h2>
       <p style="margin:0;color:#374151;font-size:14px;">{current} of {goal} applications this week</p>
       <p style="margin:8px 0 0;color:#4b5563;font-size:13px;">Current streak: {streak} week{plural}</p>
     </div>"##
            )
        }
    };

    let overdue_section = if data.overdue_follow_ups.is_empty() {
        String::new()
    } else {
        let overdue_count = data.overdue_follow_ups.len();
        format!(
            r##"<div style="padding:24px 32px;border-bottom:1px solid #f3f4f6;background:#fff5f5;">
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#991b1b;">
        ⚠️ Overdue follow-ups <span style="font-weight:400;color:#b91c1c;">({overdue_count})</span>
      </h2>
      {overdue_html}
    </div>"##
        )
    };

    let total_applications = data.total_applications;
    let new_count = data.new_this_week.len();
    let upcoming_count = data.upcoming_follow_ups.len();

    format!(
        r##"<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:32px 32px 24px;">
       <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">Your {title} Job Search Digest</h1>
       <p style="margin:6px 0 0;color:#bfdbfe;font-size:14px;">{period_label}</p>
    </div>

    <!-- Overview -->
    <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6;">
      <div style="display:inline-block;background:#eff6ff;border-radius:8px;padding:16px 24px;text-align:center;min-width:120px;">
        <p style="margin:0;font-size:36px;font-weight:700;color:#1d4ed8;">{total_applications}</p>
        <p style="margin:4px 0 0;font-size:13px;color:#6b7280;">Total applications</p>
      </div>
      <table style="width:100%;margin-top:16px;border-collapse:collapse;">
        {status_rows}
      </table>
    </div>

    <!-- New this week -->
    {goal_html}

    <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6;">
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">
         🆕 New {period} <span style="font-weight:400;color:#6b7280;">({new_count})</span>
      </h2>
      {new_apps_html}
    </div>

    <!-- Overdue follow-ups -->
    {overdue_section}

    <!-- Upcoming follow-ups -->
    <div style="padding:24px 32px;border-bottom:1px solid #f3f4f6;">
      <h2 style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">
         📅 Upcoming follow-ups {period} <span style="font-weight:400;color:#6b7280;">({upcoming_count})</span>
      </h2>
      {upcoming_html}
    </div>

    <!-- Footer -->
    <div style="padding:20px 32px;text-align:center;background:#f9fafb;">
      <p style="margin:0;font-size:13px;color:#9ca3af;">
        Keep going — consistency wins job searches.
      </p>
    </div>
  </div>
</body>
</html>"##
    )
}

#[cfg(test)]
mod tests {
    use super::super::test_support::{at, sha256_hex};
    use super::*;
    use crate::use_cases::ports::email_service::{DigestApplication, DigestFollowUp};

    const WEEK: &str = "Week of June 1, 2024";

    fn weekly(data: &WeeklyDigestData, label: &str) -> String {
        build_weekly_digest_html(data, label, DigestFrequency::Weekly)
    }

    fn statuses(pairs: &[(&str, i64)]) -> Vec<(String, i64)> {
        pairs.iter().map(|(status, count)| (status.to_string(), *count)).collect()
    }

    fn application(company: &str, role: &str) -> DigestApplication {
        DigestApplication { company: company.to_string(), role: role.to_string() }
    }

    fn follow_up(company: &str, role: &str, iso: &str) -> DigestFollowUp {
        DigestFollowUp {
            company: company.to_string(),
            role: role.to_string(),
            follow_up_at: at(iso),
        }
    }

    fn full() -> WeeklyDigestData {
        WeeklyDigestData {
            total_applications: 12,
            by_status: statuses(&[
                ("draft", 0),
                ("applied", 5),
                ("interviewing", 3),
                ("mystery_status", 1),
                ("offered", 2),
                ("accepted", 1),
            ]),
            new_this_week: vec![
                application("Acme Corp", "Software Engineer"),
                application("Beta & Sons <Ltd>", "PM \"Lead\""),
            ],
            overdue_follow_ups: vec![follow_up("Beta Inc", "PM", "2024-05-20T00:00:00.000Z")],
            upcoming_follow_ups: vec![
                follow_up("Gamma", "Designer", "2024-06-03T15:30:00.000Z"),
                follow_up("Delta", "Analyst", "2024-06-09T23:59:59.000Z"),
            ],
            weekly_application_goal: Some(5),
            current_week_application_count: Some(2),
            application_streak_weeks: Some(1),
        }
    }

    #[test]
    fn includes_the_week_label_and_total_application_count() {
        let html = weekly(&WeeklyDigestData::default(), WEEK);

        assert!(html.contains(WEEK));
        assert!(html.contains(">0</p>"));
    }

    #[test]
    fn shows_empty_state_copy_for_new_and_upcoming_and_omits_the_overdue_section() {
        let html = weekly(&WeeklyDigestData::default(), WEEK);

        assert!(html.contains("No new applications this week."));
        assert!(html.contains("No upcoming follow-ups this week."));
        // An HTML comment reading "Overdue follow-ups" is always present as a
        // source marker, so this checks for the visible heading text.
        assert!(!html.contains("⚠️ Overdue follow-ups"));
    }

    #[test]
    fn lists_new_applications_with_company_and_role() {
        let data = WeeklyDigestData {
            new_this_week: vec![application("Acme Corp", "Software Engineer")],
            ..WeeklyDigestData::default()
        };

        let html = weekly(&data, WEEK);

        assert!(html.contains("Acme Corp"));
        assert!(html.contains("Software Engineer"));
        assert!(!html.contains("No new applications this week."));
    }

    #[test]
    fn renders_the_overdue_section_only_when_there_are_overdue_items() {
        let with_overdue = WeeklyDigestData {
            overdue_follow_ups: vec![follow_up("Beta Inc", "PM", "2024-05-20T00:00:00.000Z")],
            ..WeeklyDigestData::default()
        };

        let html = weekly(&with_overdue, "label");
        assert!(html.contains("⚠️ Overdue follow-ups"));
        assert!(html.contains("Due May 20"));
        assert!(!weekly(&WeeklyDigestData::default(), "label").contains(
            r#"style="padding:24px 32px;border-bottom:1px solid #f3f4f6;background:#fff5f5;""#
        ));
    }

    #[test]
    fn maps_a_known_status_to_its_human_readable_label() {
        let data = WeeklyDigestData {
            by_status: statuses(&[("interviewing", 3)]),
            ..WeeklyDigestData::default()
        };

        let html = weekly(&data, "label");

        assert!(html.contains(">Interviewing<"));
        assert!(html.contains(">3<"));
    }

    #[test]
    fn falls_back_to_the_raw_status_string_for_an_unknown_status() {
        let data = WeeklyDigestData {
            by_status: statuses(&[("mystery_status", 1)]),
            ..WeeklyDigestData::default()
        };

        assert!(weekly(&data, "label").contains("mystery_status"));
    }

    #[test]
    fn omits_statuses_with_a_zero_count() {
        let data = WeeklyDigestData {
            by_status: statuses(&[("draft", 0), ("applied", 2)]),
            ..WeeklyDigestData::default()
        };

        let html = weekly(&data, "label");

        assert!(!html.contains(">Draft<"));
        assert!(html.contains(">Applied<"));
    }

    #[test]
    fn a_daily_digest_talks_about_today() {
        let html = build_weekly_digest_html(
            &WeeklyDigestData::default(),
            "Day of June 1, 2024",
            DigestFrequency::Daily,
        );

        assert!(html.contains("Your Daily Job Search Digest"));
        assert!(html.contains("No new applications today."));
        assert!(html.contains("No upcoming follow-ups today."));
    }

    #[test]
    fn the_goal_block_appears_only_with_a_goal_and_pluralises_the_streak() {
        assert!(!weekly(&WeeklyDigestData::default(), WEEK).contains("Weekly application goal"));

        let one_week = weekly(&full(), WEEK);
        assert!(one_week.contains("2 of 5 applications this week"));
        assert!(one_week.contains("Current streak: 1 week<"));

        let defaults =
            WeeklyDigestData { weekly_application_goal: Some(3), ..WeeklyDigestData::default() };
        let html = weekly(&defaults, WEEK);
        assert!(html.contains("0 of 3 applications this week"));
        assert!(html.contains("Current streak: 0 weeks<"));
    }

    /// The hashes are of the HTML `apps/api`'s template renders for the same
    /// input (with `TZ=UTC`), so any drift in markup, whitespace or date
    /// format fails here.
    #[test]
    fn renders_the_same_bytes_as_the_original() {
        let empty = WeeklyDigestData::default();
        let goal_defaults =
            WeeklyDigestData { weekly_application_goal: Some(3), ..WeeklyDigestData::default() };
        let goal_streak = WeeklyDigestData {
            weekly_application_goal: Some(3),
            current_week_application_count: Some(4),
            application_streak_weeks: Some(6),
            ..WeeklyDigestData::default()
        };
        let daily = |data: &WeeklyDigestData| {
            build_weekly_digest_html(data, "Day of June 1, 2024", DigestFrequency::Daily)
        };

        let cases = [
            (
                "empty weekly",
                weekly(&empty, WEEK),
                "908661dc181821e550608994020433db73a11edd04ee864c0e27e416fd66bbe4",
            ),
            (
                "empty daily",
                daily(&empty),
                "4c697d86f89b62f9f9dc5320931d41854e73ba5edfadd162a24049610c886068",
            ),
            (
                "full weekly",
                weekly(&full(), WEEK),
                "aed41f0660cc5b284aa9590f4b4227a6791cc838dc450ef7593e15cb09a5950b",
            ),
            (
                "full daily",
                daily(&full()),
                "694875f3c106119b11239ac4ceefbafd3fb910180ecd830a458f38d8553940f2",
            ),
            (
                "goal with defaults",
                weekly(&goal_defaults, WEEK),
                "9ffbcf36f09daa2ea761d64b916ef576719edbf3309491961ff22875a6e5124a",
            ),
            (
                "goal with a streak",
                weekly(&goal_streak, WEEK),
                "7dbb0ca3c4f32bbda57d3d40878e7c45e7611a2e143e06193e8502d393900a1a",
            ),
        ];
        for (name, html, expected) in cases {
            assert_eq!(sha256_hex(&html), expected, "{name}");
        }
    }
}
