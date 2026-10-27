export const EMAIL_VERIFICATION_QUERY = `
  query EmailVerification {
    me {
      email
      emailVerified
    }
  }
`;

export const RESEND_VERIFICATION_EMAIL_MUTATION = `
  mutation ResendVerificationEmail {
    resendVerificationEmail
  }
`;
