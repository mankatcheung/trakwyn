import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  EMAIL_COLORS,
  emailButton,
  escapeHtml,
  renderEmail,
} from '#src/infrastructure/email/templates/emailLayout.js';
import {
  buildAccountDeletionCancelledHtml,
  buildAccountDeletionConfirmationHtml,
  buildAccountDeletionScheduledHtml,
  buildStepUpCodeHtml,
} from '#src/infrastructure/email/templates/accountDeletionTemplates.js';
import { buildBackupEmailVerificationHtml } from '#src/infrastructure/email/templates/backupEmailVerificationTemplate.js';
import { buildEmailVerificationHtml } from '#src/infrastructure/email/templates/emailVerificationTemplate.js';
import { buildNewDeviceLoginAlertHtml } from '#src/infrastructure/email/templates/newDeviceLoginAlertTemplate.js';
import { buildPasswordResetHtml } from '#src/infrastructure/email/templates/passwordResetTemplate.js';
import { buildWeeklyDigestHtml } from '#src/infrastructure/email/templates/weeklyDigestTemplate.js';
import { ENV } from '#src/infrastructure/config/constants.js';

const EMOJI = /\p{Extended_Pictographic}/u;

describe('renderEmail and emailButton', () => {
  it('uses the stone page, ink-blue button and a bgcolor fallback for Outlook', () => {
    const html = renderEmail({
      title: 'Hello',
      bodyHtml: emailButton('https://example.com/go', 'Go'),
    });

    expect(html).toContain(`background-color:${EMAIL_COLORS.page}`);
    expect(html).toContain('bgcolor="#1e40af"');
    expect(html).toContain('background-color:#1e40af');
    expect(html).toContain('href="https://example.com/go"');
  });

  it('escapes the title and preheader', () => {
    const html = renderEmail({ title: '<b>x</b>', preheader: '<i>y</i>', bodyHtml: '' });

    expect(html).not.toContain('<b>x</b>');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('&lt;i&gt;y&lt;/i&gt;');
  });

  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('every transactional email', () => {
  const original = process.env[ENV.WEB_APP_ORIGIN];
  beforeEach(() => {
    process.env[ENV.WEB_APP_ORIGIN] = 'https://www.trakwyn.com';
  });
  afterEach(() => {
    if (original === undefined) delete process.env[ENV.WEB_APP_ORIGIN];
    else process.env[ENV.WEB_APP_ORIGIN] = original;
  });

  const url = 'https://www.trakwyn.com/x?token=abc';
  const digest = {
    totalApplications: 3,
    byStatus: { applied: 3 },
    newThisWeek: [{ company: 'Acme', role: 'Engineer' }],
    overdueFollowUps: [{ company: 'Beta', role: 'PM', followUpAt: new Date('2026-11-01') }],
    upcomingFollowUps: [{ company: 'Gamma', role: 'QA', followUpAt: new Date('2026-11-30') }],
    weeklyApplicationGoal: 5,
    currentWeekApplicationCount: 3,
    applicationStreakWeeks: 2,
  };

  const emails: Record<string, () => string> = {
    verification: () => buildEmailVerificationHtml(url),
    passwordReset: () => buildPasswordResetHtml(url),
    backupEmail: () => buildBackupEmailVerificationHtml(url),
    newDevice: () =>
      buildNewDeviceLoginAlertHtml('Chrome on macOS', 'London, GB', '203.0.113.4', new Date()),
    weeklyDigest: () => buildWeeklyDigestHtml(digest, 'Week of Nov 23'),
    dailyDigest: () => buildWeeklyDigestHtml(digest, 'Today', 'daily'),
    stepUp: () => buildStepUpCodeHtml('123456', 10),
    deletionConfirm: () => buildAccountDeletionConfirmationHtml(url, 30, 14),
    deletionScheduled: () => buildAccountDeletionScheduledHtml(new Date(), url, true),
    deletionCancelled: () => buildAccountDeletionCancelledHtml(),
  };

  it.each(Object.entries(emails))('%s has no gradient, emoji or heavy weight', (_name, build) => {
    const html = build();

    expect(html).not.toContain('linear-gradient');
    expect(html).not.toMatch(EMOJI);
    expect(html).not.toMatch(/font-weight:\s*(600|700|800|900|bold)/);
    expect(html).not.toContain('#2563eb');
    expect(html).toContain('<h1');
  });

  it.each(Object.entries(emails))('%s gives every link a non-empty href', (_name, build) => {
    const anchors = build().match(/<a\b[^>]*>/g) ?? [];

    for (const anchor of anchors) expect(anchor).toMatch(/href="[^"]+"/);
  });

  it.each([
    ['verification', emails.verification],
    ['passwordReset', emails.passwordReset],
    ['backupEmail', emails.backupEmail],
    ['deletionScheduled', emails.deletionScheduled],
  ])('%s uses the ink-blue button', (_name, build) => {
    expect(build()).toContain('bgcolor="#1e40af"');
  });

  it('keeps the deletion confirmation button red because it is destructive', () => {
    expect(emails.deletionConfirm()).toContain(`bgcolor="${EMAIL_COLORS.danger}"`);
  });
});
