export const EMAIL_VERIFICATION_QUERY = `
  query EmailVerification {
    me {
      email
      emailVerified
      deletionScheduledAt
    }
  }
`;

/** Cancels the signed-in account's scheduled deletion (JEF-463). */
export const CANCEL_ACCOUNT_DELETION_MUTATION = `
  mutation CancelAccountDeletion {
    cancelAccountDeletion
  }
`;

export const RESEND_VERIFICATION_EMAIL_MUTATION = `
  mutation ResendVerificationEmail {
    resendVerificationEmail
  }
`;
