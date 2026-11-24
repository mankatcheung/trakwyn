import { emailButton, emailFootnote, emailParagraph, renderEmail } from './emailLayout.js';

export function buildEmailVerificationHtml(verifyUrl: string): string {
  return renderEmail({
    title: 'Verify your email',
    preheader: 'Confirm this is your email address to finish setting up Trakwyn.',
    bodyHtml: [
      emailParagraph(
        'Confirm this is your email address to finish setting up your Trakwyn account. Click the button below. This link expires in 24 hours.',
      ),
      emailButton(verifyUrl, 'Verify email'),
      emailFootnote("If you didn't create this account, you can safely ignore this email."),
    ].join('\n'),
  });
}
