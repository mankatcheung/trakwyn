/**
 * The mails behind step-up codes and account deletion (JEF-463). One module
 * because they share a layout and every value they interpolate is one this
 * server made (a code, a link it signed, a date), never user input.
 */

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:linear-gradient(135deg,#2563eb,#4f46e5);padding:32px 32px 24px;">
      <h1 style="margin:0;color:#fff;font-size:22px;font-weight:700;">${title}</h1>
    </div>
    <div style="padding:32px;">
${body}
    </div>
  </div>
</body>
</html>`;
}

function paragraph(text: string): string {
  return `      <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.5;">${text}</p>`;
}

function footnote(text: string): string {
  return `      <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.5;">${text}</p>`;
}

function button(url: string, label: string, color: string): string {
  return `      <p style="margin:0 0 28px;text-align:center;">
        <a href="${url}" style="display:inline-block;background:${color};color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;text-decoration:none;">${label}</a>
      </p>`;
}

const BLUE = '#2563eb';
const RED = '#dc2626';

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function buildStepUpCodeHtml(code: string, ttlMinutes: number): string {
  return layout(
    'Your verification code',
    [
      paragraph(
        `Enter this code in Trakwyn to confirm it's you. It expires in ${ttlMinutes} minutes.`,
      ),
      `      <p style="margin:0 0 28px;text-align:center;font-size:32px;font-weight:700;letter-spacing:8px;color:#111827;">${code}</p>`,
      footnote(
        "If you didn't ask for this, someone may be signed in to your account. Secure the Google or GitHub account you sign in with, and sign out of other sessions in Settings → Security.",
      ),
    ].join('\n'),
  );
}

export function buildAccountDeletionConfirmationHtml(
  confirmUrl: string,
  ttlMinutes: number,
  graceDays: number,
): string {
  return layout(
    'Confirm account deletion',
    [
      paragraph(
        `You asked to delete your Trakwyn account. Click the button below to confirm. Your account will then be deleted for good after ${graceDays} days, and you can cancel at any time before that. This link expires in ${ttlMinutes} minutes.`,
      ),
      button(confirmUrl, 'Confirm deletion', RED),
      footnote(
        "If you didn't ask for this, ignore this email: nothing changes unless the link is used. Someone may be signed in to your account, so consider signing out of other sessions in Settings → Security.",
      ),
    ].join('\n'),
  );
}

export function buildAccountDeletionScheduledHtml(
  deletionDate: Date,
  cancelUrl: string,
  hadSubscription: boolean,
): string {
  const subscription = hadSubscription
    ? paragraph(
        "Your subscription won't renew. It stays paid until the end of the current period, which is not refunded. If you cancel the deletion, it renews again as before.",
      )
    : '';
  return layout(
    'Your account will be deleted',
    [
      paragraph(
        `Your Trakwyn account and everything in it will be permanently deleted on <strong>${formatDate(deletionDate)}</strong>. You have been signed out everywhere.`,
      ),
      subscription,
      paragraph('Changed your mind? Cancel the deletion before then and nothing is lost.'),
      button(cancelUrl, 'Cancel deletion', BLUE),
      footnote(
        "If you didn't do this, cancel the deletion now, then change your password and review Settings → Security.",
      ),
    ]
      .filter((part) => part.length > 0)
      .join('\n'),
  );
}

export function buildAccountDeletionCancelledHtml(): string {
  return layout(
    'Account deletion cancelled',
    [
      paragraph('The scheduled deletion of your Trakwyn account was cancelled. Nothing was lost.'),
      footnote(
        "If you didn't cancel it, someone else has your sign-in details or this email's links. Change your password and review Settings → Security.",
      ),
    ].join('\n'),
  );
}
