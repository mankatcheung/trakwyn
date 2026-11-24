import type { WeeklyDigestData } from '#src/use-cases/ports/IEmailService.js';
import { EMAIL_COLORS, escapeHtml, renderEmail } from './emailLayout.js';

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offered: 'Offered',
  accepted: 'Accepted',
  rejected: 'Rejected',
  withdrawn: 'Withdrawn',
};

const SECTION_STYLE = `padding:20px 0;border-top:1px solid ${EMAIL_COLORS.border};`;
const HEADING_STYLE = `margin:0 0 12px;font-size:15px;font-weight:500;color:${EMAIL_COLORS.text};`;
const EMPTY_STYLE = `color:${EMAIL_COLORS.muted};font-size:14px;margin:0;`;

function followUpRow(
  a: { company: string; role: string },
  detail: string,
  detailColor: string,
): string {
  return `<div style="padding:8px 0;border-bottom:1px solid ${EMAIL_COLORS.border};font-size:14px;">
  <span style="font-weight:500;color:${EMAIL_COLORS.text};">${escapeHtml(a.company)}</span>
  <span style="color:${EMAIL_COLORS.secondary};margin-left:6px;">— ${escapeHtml(a.role)}</span>
  <span style="color:${detailColor};font-size:12px;margin-left:8px;">${detail}</span>
</div>`;
}

export function buildWeeklyDigestHtml(
  data: WeeklyDigestData,
  periodLabel: string,
  frequency: 'daily' | 'weekly' = 'weekly',
): string {
  const period = frequency === 'daily' ? 'today' : 'this week';
  const statusRows = Object.entries(data.byStatus)
    .filter(([, count]) => count > 0)
    .map(
      ([status, count]) =>
        `<tr>
  <td style="padding:6px 0;font-size:14px;color:${EMAIL_COLORS.secondary};">${escapeHtml(STATUS_LABELS[status] ?? status)}</td>
  <td style="padding:6px 0;font-size:14px;text-align:right;font-weight:500;color:${EMAIL_COLORS.text};">${count}</td>
</tr>`,
    )
    .join('');

  const newAppsHtml =
    data.newThisWeek.length === 0
      ? `<p style="${EMPTY_STYLE}">No new applications ${period}.</p>`
      : data.newThisWeek.map((a) => followUpRow(a, '', EMAIL_COLORS.muted)).join('');

  const overdueHtml = data.overdueFollowUps
    .map((a) =>
      followUpRow(
        a,
        `Due ${a.followUpAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
        EMAIL_COLORS.danger,
      ),
    )
    .join('');

  const upcomingHtml =
    data.upcomingFollowUps.length === 0
      ? `<p style="${EMPTY_STYLE}">No upcoming follow-ups ${period}.</p>`
      : data.upcomingFollowUps
          .map((a) =>
            followUpRow(
              a,
              a.followUpAt.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
              }),
              EMAIL_COLORS.accent,
            ),
          )
          .join('');

  const streakWeeks = data.applicationStreakWeeks ?? 0;
  const goalHtml =
    data.weeklyApplicationGoal == null
      ? ''
      : `<div style="${SECTION_STYLE}">
  <h2 style="${HEADING_STYLE}">Weekly application goal</h2>
  <p style="margin:0;color:${EMAIL_COLORS.secondary};font-size:14px;">${data.currentWeekApplicationCount ?? 0} of ${data.weeklyApplicationGoal} applications this week</p>
  <p style="margin:8px 0 0;color:${EMAIL_COLORS.muted};font-size:13px;">Current streak: ${streakWeeks} week${streakWeeks === 1 ? '' : 's'}</p>
</div>`;

  const overdueSection =
    data.overdueFollowUps.length > 0
      ? `<div style="${SECTION_STYLE}">
  <h2 style="${HEADING_STYLE}color:${EMAIL_COLORS.danger};">Overdue follow-ups <span style="font-weight:400;">(${data.overdueFollowUps.length})</span></h2>
  ${overdueHtml}
</div>`
      : '';

  const bodyHtml = `<p style="margin:-12px 0 20px;font-size:14px;color:${EMAIL_COLORS.muted};">${escapeHtml(periodLabel)}</p>
<div style="padding-bottom:20px;">
  <p style="margin:0;font-size:36px;font-weight:500;color:${EMAIL_COLORS.accent};">${data.totalApplications}</p>
  <p style="margin:4px 0 0;font-size:13px;color:${EMAIL_COLORS.muted};">Total applications</p>
  <table role="presentation" style="width:100%;margin-top:16px;border-collapse:collapse;">
    ${statusRows}
  </table>
</div>
${goalHtml}
<div style="${SECTION_STYLE}">
  <h2 style="${HEADING_STYLE}">New ${period} <span style="font-weight:400;color:${EMAIL_COLORS.muted};">(${data.newThisWeek.length})</span></h2>
  ${newAppsHtml}
</div>
${overdueSection}
<div style="${SECTION_STYLE}">
  <h2 style="${HEADING_STYLE}">Upcoming follow-ups ${period} <span style="font-weight:400;color:${EMAIL_COLORS.muted};">(${data.upcomingFollowUps.length})</span></h2>
  ${upcomingHtml}
</div>
<p style="margin:0;padding-top:20px;border-top:1px solid ${EMAIL_COLORS.border};font-size:13px;color:${EMAIL_COLORS.muted};">Keep going — consistency wins job searches.</p>`;

  return renderEmail({
    title: `Your ${frequency === 'daily' ? 'daily' : 'weekly'} job search digest`,
    preheader: `${data.totalApplications} applications. ${periodLabel}`,
    bodyHtml,
  });
}
