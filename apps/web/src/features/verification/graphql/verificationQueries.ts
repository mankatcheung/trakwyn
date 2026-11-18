import { graphql } from '#/graphql/generated';

export const EMAIL_VERIFICATION_QUERY = graphql(`
  query EmailVerification {
    me {
      email
      emailVerified
      deletionScheduledAt
    }
  }
`);

export const RESEND_VERIFICATION_EMAIL = graphql(`
  mutation ResendVerificationEmail {
    resendVerificationEmail
  }
`);

export const VERIFY_EMAIL_MUTATION = graphql(`
  mutation VerifyEmail($token: String!) {
    verifyEmail(token: $token)
  }
`);
