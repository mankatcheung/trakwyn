import type { IEmailService, WeeklyDigestData } from '#src/use-cases/ports/IEmailService.js';
import { buildWeeklyDigestHtml } from './templates/weeklyDigestTemplate.js';
import { buildPasswordResetHtml } from './templates/passwordResetTemplate.js';
import { buildEmailVerificationHtml } from './templates/emailVerificationTemplate.js';
import { buildBackupEmailVerificationHtml } from './templates/backupEmailVerificationTemplate.js';
import { buildNewDeviceLoginAlertHtml } from './templates/newDeviceLoginAlertTemplate.js';
import { EMAIL, ENV } from '#src/infrastructure/config/constants.js';
import {
  otelMetrics,
  type EmailTemplate,
  type IMetrics,
} from '#src/infrastructure/observability/metrics.js';

export interface BrevoEmailServiceOptions {
  metrics?: IMetrics;
}

/**
 * Brevo's error `code` is a short machine token (`unauthorized`,
 * `invalid_parameter`); anything that does not look like one is dropped
 * rather than risk echoing the recipient back.
 */
const BREVO_ERROR_CODE = /^[a-z_]{1,64}$/;

export class BrevoEmailService implements IEmailService {
  private readonly apiKey: string;
  private readonly fromEmail: string;
  private readonly fromName: string;
  private readonly metrics: IMetrics;

  constructor(options: BrevoEmailServiceOptions = {}) {
    this.apiKey = process.env[ENV.BREVO_API_KEY] ?? '';
    this.fromEmail = process.env[ENV.FROM_EMAIL] ?? EMAIL.DEFAULT_FROM_EMAIL;
    this.fromName = process.env[ENV.FROM_NAME] ?? EMAIL.DEFAULT_FROM_NAME;
    this.metrics = options.metrics ?? otelMetrics;
  }

  async sendFollowUpReminder(
    to: string,
    company: string,
    role: string,
    followUpAt: Date,
  ): Promise<void> {
    const date = followUpAt.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    await this.send(
      'follow_up_reminder',
      to,
      `Reminder: Follow up on ${role} at ${company}`,
      `<p>This is a reminder to follow up on your <strong>${role}</strong> application at <strong>${company}</strong>.</p><p>Your scheduled follow-up date is <strong>${date}</strong>.</p>`,
    );
  }

  async sendWeeklyDigest(
    to: string,
    data: WeeklyDigestData,
    frequency: 'daily' | 'weekly' = 'weekly',
  ): Promise<void> {
    const now = new Date();
    const periodLabel = `${frequency === 'daily' ? 'Day' : 'Week'} of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    const htmlContent = buildWeeklyDigestHtml(data, periodLabel, frequency);
    await this.send(
      'weekly_digest',
      to,
      `Your ${frequency === 'daily' ? 'Daily' : 'Weekly'} Job Search Digest — ${periodLabel}`,
      htmlContent,
    );
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<void> {
    const htmlContent = buildPasswordResetHtml(resetUrl);
    await this.send('password_reset', to, 'Reset your Trakwyn password', htmlContent);
  }

  async sendEmailVerification(to: string, verifyUrl: string): Promise<void> {
    const htmlContent = buildEmailVerificationHtml(verifyUrl);
    await this.send('email_verification', to, 'Verify your Trakwyn email', htmlContent);
  }

  async sendBackupEmailVerification(to: string, verifyUrl: string): Promise<void> {
    const htmlContent = buildBackupEmailVerificationHtml(verifyUrl);
    await this.send(
      'backup_email_verification',
      to,
      'Verify your backup email for Trakwyn',
      htmlContent,
    );
  }

  async sendNewDeviceLoginAlert(
    to: string,
    deviceLabel: string,
    location: string | null,
    ipAddress: string | null,
    loginTime: Date,
  ): Promise<void> {
    const htmlContent = buildNewDeviceLoginAlertHtml(deviceLabel, location, ipAddress, loginTime);
    await this.send(
      'new_device_login_alert',
      to,
      'New device signed in to your Trakwyn account',
      htmlContent,
    );
  }

  /**
   * The one place a message goes to Brevo, so every template is counted the
   * same way (JEF-356). A request that never got an answer is a failed send
   * too — it is counted, then rethrown unchanged.
   *
   * The thrown error carries the status and Brevo's `code` only. Its body can
   * echo the request back, recipient included, and the error message ends up
   * in the logs (JEF-348).
   */
  private async send(
    template: EmailTemplate,
    to: string,
    subject: string,
    htmlContent: string,
  ): Promise<void> {
    let response: Response;
    try {
      response = await fetch(EMAIL.BREVO_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': this.apiKey },
        body: JSON.stringify({
          sender: { name: this.fromName, email: this.fromEmail },
          to: [{ email: to }],
          subject,
          htmlContent,
        }),
      });
    } catch (err) {
      this.metrics.recordEmailSent(template, 'failed');
      throw err;
    }

    if (!response.ok) {
      this.metrics.recordEmailSent(template, 'failed');
      const code = await readBrevoErrorCode(response);
      throw new Error(`Brevo API error ${response.status}${code ? ` (${code})` : ''}`);
    }
    this.metrics.recordEmailSent(template, 'sent');
  }
}

async function readBrevoErrorCode(response: Response): Promise<string | null> {
  try {
    const body: unknown = JSON.parse(await response.text());
    const code =
      typeof body === 'object' && body !== null ? (body as { code?: unknown }).code : null;
    return typeof code === 'string' && BREVO_ERROR_CODE.test(code) ? code : null;
  } catch {
    // Not JSON, or the body could not be read: the status alone still says what happened.
    return null;
  }
}
