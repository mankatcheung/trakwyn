import type { IEmailService, WeeklyDigestData } from '#src/use-cases/ports/IEmailService.js';

/**
 * Logs instead of calling Brevo — for local dev without a `BREVO_API_KEY`
 * and for CI, where the alternative was every flow that sends mail (email
 * change, backup email, password reset, new-device alerts, digests)
 * throwing when it hit Brevo with an empty API key.
 */
export class ConsoleEmailService implements IEmailService {
  async sendFollowUpReminder(
    to: string,
    company: string,
    role: string,
    followUpAt: Date,
  ): Promise<void> {
    console.log(
      `[email:console] follow-up reminder to ${to}: ${role} at ${company}, ${followUpAt.toISOString()}`,
    );
  }

  async sendWeeklyDigest(
    to: string,
    _data: WeeklyDigestData,
    frequency: 'daily' | 'weekly' = 'weekly',
  ): Promise<void> {
    console.log(`[email:console] ${frequency} digest to ${to}`);
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    console.log(`[email:console] password reset to ${to}: ${resetUrl}`);
  }

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    console.log(`[email:console] email verification to ${to}: ${verifyUrl}`);
  }

  async sendBackupEmailVerification(to: string, verifyUrl: string): Promise<void> {
    console.log(`[email:console] backup email verification to ${to}: ${verifyUrl}`);
  }

  async sendStepUpCode(to: string, code: string): Promise<void> {
    console.log(`[email:console] step-up code to ${to}: ${code}`);
  }

  async sendAccountDeletionConfirmation(to: string, confirmUrl: string): Promise<void> {
    console.log(`[email:console] account deletion confirmation to ${to}: ${confirmUrl}`);
  }

  async sendAccountDeletionScheduled(
    to: string,
    deletionDate: Date,
    cancelUrl: string,
    hadSubscription: boolean,
  ): Promise<void> {
    console.log(
      `[email:console] account deletion scheduled to ${to}: ${deletionDate.toISOString()}${hadSubscription ? ' (subscription set to end)' : ''} · cancel: ${cancelUrl}`,
    );
  }

  async sendAccountDeletionCancelled(to: string): Promise<void> {
    console.log(`[email:console] account deletion cancelled to ${to}`);
  }

  async sendNewDeviceLoginAlert(
    to: string,
    deviceLabel: string,
    location: string | null,
    ipAddress: string | null,
    loginTime: Date,
  ): Promise<void> {
    console.log(
      `[email:console] new device login alert to ${to}: ${deviceLabel} · ${location ?? 'unknown location'} · ${ipAddress ?? 'unknown IP'} · ${loginTime.toISOString()}`,
    );
  }
}
