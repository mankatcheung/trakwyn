import { graphql } from '#/graphql/generated';

/** Documents for Settings → Security and the step-up dialog (JEF-463). */

export const REQUEST_EMAIL_CHANGE = graphql(`
  mutation RequestEmailChange($currentPassword: String, $newEmail: String!) {
    requestEmailChange(currentPassword: $currentPassword, newEmail: $newEmail)
  }
`);

export const REQUEST_ADD_BACKUP_EMAIL = graphql(`
  mutation RequestAddBackupEmail($currentPassword: String, $backupEmail: String!) {
    requestAddBackupEmail(currentPassword: $currentPassword, backupEmail: $backupEmail)
  }
`);

export const REMOVE_BACKUP_EMAIL = graphql(`
  mutation RemoveBackupEmail($currentPassword: String) {
    removeBackupEmail(currentPassword: $currentPassword)
  }
`);

export const UPDATE_PASSWORD = graphql(`
  mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {
    updatePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`);

export const REAUTHENTICATE = graphql(`
  mutation Reauthenticate($password: String!, $code: String) {
    reauthenticate(password: $password, code: $code) {
      success
      totpRequired
      accessToken
    }
  }
`);

export const SECURITY_ACTIVITY = graphql(`
  query SecurityActivity {
    securityActivity {
      id
      eventType
      ipAddress
      userAgent
      createdAt
    }
  }
`);

export const SESSIONS_QUERY = graphql(`
  query Sessions {
    sessions {
      id
      userAgent
      ipAddress
      deviceLabel
      location
      lastUsedAt
      current
    }
  }
`);

export const REVOKE_SESSION = graphql(`
  mutation RevokeSession($id: ID!) {
    revokeSession(id: $id)
  }
`);

export const REVOKE_OTHER_SESSIONS = graphql(`
  mutation RevokeOtherSessions {
    revokeOtherSessions
  }
`);

export const TOTP_ENABLED_QUERY = graphql(`
  query TotpEnabled {
    totpEnabled
  }
`);

export const BEGIN_TOTP_SETUP = graphql(`
  mutation BeginTotpSetup($password: String!) {
    beginTotpSetup(password: $password) {
      secret
      otpauthUrl
      qrCodeDataUrl
    }
  }
`);

export const CONFIRM_TOTP_SETUP = graphql(`
  mutation ConfirmTotpSetup($code: String!) {
    confirmTotpSetup(code: $code) {
      backupCodes
    }
  }
`);

export const DISABLE_TOTP = graphql(`
  mutation DisableTotp($password: String!) {
    disableTotp(password: $password)
  }
`);

export const REGENERATE_TOTP_BACKUP_CODES = graphql(`
  mutation RegenerateTotpBackupCodes($currentPassword: String!) {
    regenerateTotpBackupCodes(currentPassword: $currentPassword) {
      backupCodes
    }
  }
`);

export const LINKED_OAUTH_ACCOUNTS_QUERY = graphql(`
  query LinkedOAuthAccounts {
    linkedOAuthAccounts {
      provider
      email
      createdAt
    }
  }
`);

export const UNLINK_OAUTH_ACCOUNT = graphql(`
  mutation UnlinkOAuthAccount($provider: OAuthProvider!) {
    unlinkOAuthAccount(provider: $provider)
  }
`);

export const STEP_UP_METHODS_QUERY = graphql(`
  query StepUpMethods {
    me {
      stepUpMethods
    }
  }
`);

export const START_OAUTH_REAUTH = graphql(`
  mutation StartOAuthReauth($provider: OAuthProvider!) {
    startOAuthReauth(provider: $provider)
  }
`);

export const REQUEST_STEP_UP_CODE = graphql(`
  mutation RequestStepUpCode {
    requestStepUpCode
  }
`);

export const VERIFY_STEP_UP_CODE = graphql(`
  mutation VerifyStepUpCode($code: String!) {
    verifyStepUpCode(code: $code)
  }
`);
