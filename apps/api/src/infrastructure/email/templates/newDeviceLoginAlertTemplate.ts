import { ENV } from '#src/infrastructure/config/constants.js';
import { EMAIL_COLORS, emailParagraph, escapeHtml, renderEmail } from './emailLayout.js';

export function buildNewDeviceLoginAlertHtml(
  deviceLabel: string,
  location: string | null,
  ipAddress: string | null,
  loginTime: Date,
): string {
  // No fallback on purpose. This link is the entire point of the email — it is
  // where someone goes when they think their account is compromised — so a
  // guessed origin would send them somewhere that is not Trakwyn at the exact
  // moment they most need it to be. Failing to send beats sending a wrong
  // address, and an unset variable is a deployment mistake worth surfacing
  // rather than papering over.
  const webAppOrigin = process.env[ENV.WEB_APP_ORIGIN]?.trim();
  if (!webAppOrigin) {
    throw new Error(
      `${ENV.WEB_APP_ORIGIN} is not set — refusing to build a security alert email without a trustworthy link`,
    );
  }

  const dateStr = loginTime.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const detail = (text: string) =>
    `<p style="margin:0 0 8px;color:${EMAIL_COLORS.secondary};font-size:14px;">${escapeHtml(text)}</p>`;
  const locationLine = location ? detail(`Location: ${location}`) : '';
  const ipLine = ipAddress ? detail(`IP: ${ipAddress}`) : '';
  const link = `<a href="${escapeHtml(webAppOrigin)}/settings/security" style="color:${EMAIL_COLORS.accent};text-decoration:underline;">review your active sessions</a>`;

  return renderEmail({
    title: 'New device signed in to your account',
    preheader: `${deviceLabel} signed in to your Trakwyn account.`,
    bodyHtml: [
      emailParagraph('A new device was used to sign in to your Trakwyn account.'),
      `<div style="background-color:${EMAIL_COLORS.page};border:1px solid ${EMAIL_COLORS.border};border-radius:6px;padding:16px;margin-bottom:20px;">
  <p style="margin:0 0 8px;font-weight:500;color:${EMAIL_COLORS.text};font-size:15px;">${escapeHtml(deviceLabel)}</p>
  ${locationLine}
  ${ipLine}
  <p style="margin:0;color:${EMAIL_COLORS.muted};font-size:13px;">${escapeHtml(dateStr)}</p>
</div>`,
      emailParagraph('If this was you, no action is needed.'),
      emailParagraph(
        `If you don't recognise this activity, please ${link} and revoke any you don't recognise. You should also consider changing your password.`,
      ),
    ].join('\n'),
  });
}
