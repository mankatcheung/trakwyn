import { describe, expect, it } from 'vitest';
import {
  buildAccountDeletionCancelledHtml,
  buildAccountDeletionConfirmationHtml,
  buildAccountDeletionScheduledHtml,
  buildStepUpCodeHtml,
} from '#src/infrastructure/email/templates/accountDeletionTemplates.js';
import { buildBackupEmailVerificationHtml } from '#src/infrastructure/email/templates/backupEmailVerificationTemplate.js';

describe('account deletion templates', () => {
  it('shows the step-up code and its lifetime', () => {
    const html = buildStepUpCodeHtml('482913', 10);

    expect(html).toContain('482913');
    expect(html).toContain('expires in 10 minutes');
  });

  it('links the confirmation button and states the grace period', () => {
    const html = buildAccountDeletionConfirmationHtml('https://x.test/confirm?t=1', 30, 14);

    expect(html).toContain('href="https://x.test/confirm?t=1"');
    expect(html).toContain('after 14 days');
    expect(html).toContain('This link expires in 30 minutes');
  });

  it('names the deletion date, and mentions the subscription only when there was one', () => {
    const date = new Date('2026-12-25T00:00:00Z');

    const withSub = buildAccountDeletionScheduledHtml(date, 'https://x.test/cancel', true);
    const withoutSub = buildAccountDeletionScheduledHtml(date, 'https://x.test/cancel', false);

    expect(withSub).toContain('Friday, December 25, 2026');
    expect(withSub).toContain('href="https://x.test/cancel"');
    expect(withSub).toContain("Your subscription won't renew");
    expect(withoutSub).not.toContain('subscription');
  });

  it('confirms the cancellation', () => {
    expect(buildAccountDeletionCancelledHtml()).toContain('was cancelled');
  });
});

describe('buildBackupEmailVerificationHtml', () => {
  it('links the verify button and mentions the 24 hour expiry', () => {
    const html = buildBackupEmailVerificationHtml('https://x.test/backup?t=1');

    expect(html).toContain('href="https://x.test/backup?t=1"');
    expect(html).toContain('expires in 24 hours');
    expect(html).toContain('Verify backup email');
  });
});
