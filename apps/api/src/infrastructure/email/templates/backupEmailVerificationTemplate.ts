import { emailButton, emailFootnote, emailParagraph, renderEmail } from './emailLayout.js';

export function buildBackupEmailVerificationHtml(verifyUrl: string): string {
  return renderEmail({
    title: 'Verify your backup email',
    preheader: 'Confirm this address as a backup recovery method.',
    bodyHtml: [
      emailParagraph(
        "You've added this email as a backup recovery method for your Trakwyn account. Click the button below to verify it. This link expires in 24 hours.",
      ),
      emailButton(verifyUrl, 'Verify backup email'),
      emailFootnote("If you didn't request this, you can safely ignore this email."),
    ].join('\n'),
  });
}
