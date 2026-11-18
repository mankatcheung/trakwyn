import { graphql } from '#/graphql/generated';

/**
 * One request answers the whole `_authenticated` guard (JEF-535): email
 * verification, a scheduled deletion and the welcome flow.
 */
export const SESSION_GATE_QUERY = graphql(`
  query SessionGate {
    me {
      email
      emailVerified
      deletionScheduledAt
      onboardingCompletedAt
      onboardingGoals
    }
  }
`);

export const LOGIN_MUTATION = graphql(`
  mutation Login($email: String!, $password: String!, $captchaToken: String) {
    login(email: $email, password: $password, captchaToken: $captchaToken) {
      success
      totpRequired
      accessToken
    }
  }
`);

export const LOGIN_WITH_TOTP_MUTATION = graphql(`
  mutation LoginWithTotp($email: String!, $password: String!, $code: String!) {
    loginWithTotp(email: $email, password: $password, code: $code)
  }
`);

export const REGISTER_MUTATION = graphql(`
  mutation Register($email: String!, $password: String!, $captchaToken: String) {
    register(email: $email, password: $password, captchaToken: $captchaToken)
  }
`);

export const LOGOUT_MUTATION = graphql(`
  mutation Logout {
    logout
  }
`);

export const REQUEST_PASSWORD_RESET_MUTATION = graphql(`
  mutation RequestPasswordReset($email: String!, $captchaToken: String) {
    requestPasswordReset(email: $email, captchaToken: $captchaToken)
  }
`);

export const REQUEST_BACKUP_EMAIL_RECOVERY_MUTATION = graphql(`
  mutation RequestBackupEmailRecovery($backupEmail: String!) {
    requestBackupEmailRecovery(backupEmail: $backupEmail)
  }
`);

export const RESET_PASSWORD_MUTATION = graphql(`
  mutation ResetPassword($token: String!, $newPassword: String!) {
    resetPassword(token: $token, newPassword: $newPassword)
  }
`);

export const CONFIRM_BACKUP_EMAIL_MUTATION = graphql(`
  mutation ConfirmBackupEmail($token: String!) {
    confirmBackupEmail(token: $token)
  }
`);

export const CONFIRM_EMAIL_CHANGE_MUTATION = graphql(`
  mutation ConfirmEmailChange($token: String!) {
    confirmEmailChange(token: $token)
  }
`);
