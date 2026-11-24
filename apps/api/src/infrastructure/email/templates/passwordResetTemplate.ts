import { emailButton, emailFootnote, emailParagraph, renderEmail } from './emailLayout.js';

export function buildPasswordResetHtml(resetUrl: string): string {
  return renderEmail({
    title: 'Reset your password',
    preheader: 'Choose a new password for your Trakwyn account.',
    bodyHtml: [
      emailParagraph(
        'We received a request to reset the password for your Trakwyn account. Click the button below to choose a new password. This link expires in 1 hour.',
      ),
      emailButton(resetUrl, 'Reset password'),
      emailFootnote(
        "If you didn't request this, you can safely ignore this email — your password won't be changed.",
      ),
    ].join('\n'),
  });
}
