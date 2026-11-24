import { describe, it, expect } from 'vitest';
import { buildWeeklyDigestHtml } from '#src/infrastructure/email/templates/weeklyDigestTemplate.js';
import type { WeeklyDigestData } from '#src/use-cases/ports/IEmailService.js';

const emptyData: WeeklyDigestData = {
  totalApplications: 0,
  byStatus: {},
  newThisWeek: [],
  overdueFollowUps: [],
  upcomingFollowUps: [],
};

describe('buildWeeklyDigestHtml', () => {
  it('includes the week label and total application count', () => {
    const html = buildWeeklyDigestHtml(emptyData, 'Week of June 1, 2024');

    expect(html).toContain('Week of June 1, 2024');
    expect(html).toContain('>0</p>');
  });

  it('shows empty-state copy for new and upcoming sections, and omits the overdue section entirely', () => {
    const html = buildWeeklyDigestHtml(emptyData, 'Week of June 1, 2024');

    expect(html).toContain('No new applications this week.');
    expect(html).toContain('No upcoming follow-ups this week.');
    // The overdue block is only rendered when overdueFollowUps is non-empty,
    // so its own "no overdue" copy is unreachable when the list is empty.
    // (An HTML comment literally reading "Overdue follow-ups" is always
    // present as a source marker, so we check for the visible heading text.)
    expect(html).not.toContain('⚠️ Overdue follow-ups');
  });

  it('lists new applications with company and role', () => {
    const data: WeeklyDigestData = {
      ...emptyData,
      newThisWeek: [{ company: 'Acme Corp', role: 'Software Engineer' }],
    };

    const html = buildWeeklyDigestHtml(data, 'Week of June 1, 2024');

    expect(html).toContain('Acme Corp');
    expect(html).toContain('Software Engineer');
    expect(html).not.toContain('No new applications this week.');
  });

  it('renders the overdue-follow-ups section only when there are overdue items', () => {
    const withOverdue: WeeklyDigestData = {
      ...emptyData,
      overdueFollowUps: [{ company: 'Beta Inc', role: 'PM', followUpAt: new Date('2024-05-20') }],
    };

    expect(buildWeeklyDigestHtml(withOverdue, 'label')).toContain('Overdue follow-ups');
    expect(buildWeeklyDigestHtml(emptyData, 'label')).not.toContain('Overdue follow-ups');
  });

  it('escapes company and role names', () => {
    const data: WeeklyDigestData = {
      ...emptyData,
      newThisWeek: [{ company: '<script>alert(1)</script>', role: 'R&D "Lead"' }],
    };

    const html = buildWeeklyDigestHtml(data, 'label');

    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('R&amp;D &quot;Lead&quot;');
  });

  it('maps a known status to its human-readable label', () => {
    const data: WeeklyDigestData = { ...emptyData, byStatus: { interviewing: 3 } };

    const html = buildWeeklyDigestHtml(data, 'label');

    expect(html).toContain('Interviewing');
    expect(html).toContain('3');
  });

  it('falls back to the raw status string for an unknown status', () => {
    const data: WeeklyDigestData = { ...emptyData, byStatus: { mystery_status: 1 } };

    const html = buildWeeklyDigestHtml(data, 'label');

    expect(html).toContain('mystery_status');
  });

  it('omits statuses with a zero count', () => {
    const data: WeeklyDigestData = { ...emptyData, byStatus: { draft: 0, applied: 2 } };

    const html = buildWeeklyDigestHtml(data, 'label');

    expect(html).not.toContain('>Draft<');
    expect(html).toContain('>Applied<');
  });
});
