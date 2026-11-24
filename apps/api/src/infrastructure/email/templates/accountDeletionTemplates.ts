/**
 * The mails behind step-up codes and account deletion (JEF-463). One module
 * because they share a layout and every value they interpolate is one this
 * server made (a code, a link it signed, a date), never user input.
 */

import {
  EMAIL_COLORS,
  emailButton,
  emailFootnote,
  emailParagraph,
  renderEmail,
} from './emailLayout.js';

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
  return renderEmail({
    title: 'Your verification code',
    preheader: `Your Trakwyn code expires in ${ttlMinutes} minutes.`,
    bodyHtml: [
      emailParagraph(
        `Enter this code in Trakwyn to confirm it's you. It expires in ${ttlMinutes} minutes.`,
      ),
      `<p style="margin:0 0 28px;text-align:center;font-size:32px;font-weight:500;letter-spacing:8px;color:${EMAIL_COLORS.text};">${code}</p>`,
      emailFootnote(
        "If you didn't ask for this, someone may be signed in to your account. Secure the Google or GitHub account you sign in with, and sign out of other sessions in Settings → Security.",
      ),
    ].join('\n'),
  });
}

export function buildAccountDeletionConfirmationHtml(
  confirmUrl: string,
  ttlMinutes: number,
  graceDays: number,
): string {
  return renderEmail({
    title: 'Confirm account deletion',
    preheader: 'Confirm to schedule your account for deletion.',
    bodyHtml: [
      emailParagraph(
        `You asked to delete your Trakwyn account. Click the button below to confirm. Your account will then be deleted for good after ${graceDays} days, and you can cancel at any time before that. This link expires in ${ttlMinutes} minutes.`,
      ),
      emailButton(confirmUrl, 'Confirm deletion', EMAIL_COLORS.danger),
      emailFootnote(
        "If you didn't ask for this, ignore this email: nothing changes unless the link is used. Someone may be signed in to your account, so consider signing out of other sessions in Settings → Security.",
      ),
    ].join('\n'),
  });
}

export function buildAccountDeletionScheduledHtml(
  deletionDate: Date,
  cancelUrl: string,
  hadSubscription: boolean,
): string {
  const subscription = hadSubscription
    ? emailParagraph(
        "Your subscription won't renew. It stays paid until the end of the current period, which is not refunded. If you cancel the deletion, it renews again as before.",
      )
    : '';
  return renderEmail({
    title: 'Your account will be deleted',
    preheader: `Scheduled for ${formatDate(deletionDate)}. You can still cancel.`,
    bodyHtml: [
      emailParagraph(
        `Your Trakwyn account and everything in it will be permanently deleted on <strong style="font-weight:500;">${formatDate(deletionDate)}</strong>. You have been signed out everywhere.`,
      ),
      subscription,
      emailParagraph('Changed your mind? Cancel the deletion before then and nothing is lost.'),
      emailButton(cancelUrl, 'Cancel deletion'),
      emailFootnote(
        "If you didn't do this, cancel the deletion now, then change your password and review Settings → Security.",
      ),
    ]
      .filter((part) => part.length > 0)
      .join('\n'),
  });
}

export function buildAccountDeletionCancelledHtml(): string {
  return renderEmail({
    title: 'Account deletion cancelled',
    preheader: 'Your account is safe.',
    bodyHtml: [
      emailParagraph(
        'The scheduled deletion of your Trakwyn account was cancelled. Nothing was lost.',
      ),
      emailFootnote(
        "If you didn't cancel it, someone else has your sign-in details or this email's links. Change your password and review Settings → Security.",
      ),
    ].join('\n'),
  });
}
