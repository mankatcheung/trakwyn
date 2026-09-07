// Hand-written to match apps/web's settings pages' GraphQL operations
// field-for-field — codegen is still deferred for apps/mobile (see
// JEF-261/262). Token-limit fields (monthlyTokenLimit, llmUsageSummary,
// setLlmApiKeyMonthlyLimit) are intentionally omitted: that feature is only
// a design at this point, not yet in the schema.

export const PROFILE_QUERY = `
  query Me {
    me {
      id
      email
      name
      timezone
      targetRole
      avatarUrl
      backupEmail
      backupEmailVerifiedAt
    }
  }
`;

export const UPDATE_PROFILE_MUTATION = `
  mutation UpdateProfile($name: String, $timezone: String, $targetRole: String) {
    updateProfile(name: $name, timezone: $timezone, targetRole: $targetRole)
  }
`;

export const REQUEST_AVATAR_UPLOAD_URL_MUTATION = `
  mutation RequestAvatarUploadUrl($filename: String!, $mimeType: String!) {
    requestAvatarUploadUrl(filename: $filename, mimeType: $mimeType) {
      uploadUrl
      storageKey
    }
  }
`;

export const CONFIRM_AVATAR_MUTATION = `
  mutation ConfirmAvatar($storageKey: String!, $mimeType: String!, $sizeBytes: Int!) {
    confirmAvatar(storageKey: $storageKey, mimeType: $mimeType, sizeBytes: $sizeBytes)
  }
`;

export const REMOVE_AVATAR_MUTATION = `
  mutation RemoveAvatar {
    removeAvatar
  }
`;

export const REQUEST_EMAIL_CHANGE_MUTATION = `
  mutation RequestEmailChange($currentPassword: String!, $newEmail: String!) {
    requestEmailChange(currentPassword: $currentPassword, newEmail: $newEmail)
  }
`;

export const REQUEST_ADD_BACKUP_EMAIL_MUTATION = `
  mutation RequestAddBackupEmail($currentPassword: String!, $backupEmail: String!) {
    requestAddBackupEmail(currentPassword: $currentPassword, backupEmail: $backupEmail)
  }
`;

export const REMOVE_BACKUP_EMAIL_MUTATION = `
  mutation RemoveBackupEmail($currentPassword: String!) {
    removeBackupEmail(currentPassword: $currentPassword)
  }
`;

export const SESSIONS_QUERY = `
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
`;

export const REVOKE_SESSION_MUTATION = `
  mutation RevokeSession($id: ID!) {
    revokeSession(id: $id)
  }
`;

export const REVOKE_OTHER_SESSIONS_MUTATION = `
  mutation RevokeOtherSessions {
    revokeOtherSessions
  }
`;

export const LINKED_OAUTH_ACCOUNTS_QUERY = `
  query LinkedOAuthAccounts {
    linkedOAuthAccounts {
      provider
      email
      createdAt
    }
  }
`;

export const UNLINK_OAUTH_ACCOUNT_MUTATION = `
  mutation UnlinkOAuthAccount($provider: OAuthProvider!) {
    unlinkOAuthAccount(provider: $provider)
  }
`;

export const UPDATE_PASSWORD_MUTATION = `
  mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {
    updatePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export const NOTIFICATION_PREFERENCES_QUERY = `
  query NotificationPreferences {
    notificationPreferences {
      digestFrequency
      followUpRemindersEnabled
      pushNotificationsEnabled
      weeklyApplicationGoal
    }
  }
`;

export const UPDATE_NOTIFICATION_PREFERENCES_MUTATION = `
  mutation UpdateNotificationPreferences(
    $digestFrequency: DigestFrequency
    $followUpRemindersEnabled: Boolean
    $pushNotificationsEnabled: Boolean
    $weeklyApplicationGoal: Int
  ) {
    updateNotificationPreferences(
      digestFrequency: $digestFrequency
      followUpRemindersEnabled: $followUpRemindersEnabled
      pushNotificationsEnabled: $pushNotificationsEnabled
      weeklyApplicationGoal: $weeklyApplicationGoal
    )
  }
`;

export const LLM_API_KEYS_QUERY = `
  query LlmApiKeys {
    llmApiKeys {
      provider
      model
      baseUrl
    }
    me {
      defaultLlmProvider
    }
  }
`;

export const SAVE_LLM_API_KEY_MUTATION = `
  mutation SaveLlmApiKey($provider: String!, $apiKey: String!, $model: String, $baseUrl: String) {
    saveLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl)
  }
`;

export const DELETE_LLM_API_KEY_MUTATION = `
  mutation DeleteLlmApiKey($provider: String!) {
    deleteLlmApiKey(provider: $provider)
  }
`;

export const SET_DEFAULT_LLM_PROVIDER_MUTATION = `
  mutation SetDefaultLlmProvider($provider: String!) {
    setDefaultLlmProvider(provider: $provider)
  }
`;

export const TEST_LLM_API_KEY_MUTATION = `
  mutation TestLlmApiKey($provider: String!, $apiKey: String, $model: String, $baseUrl: String) {
    testLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl) {
      ok
      error
    }
  }
`;

export const EXPORT_USER_DATA_QUERY = `
  query ExportUserData {
    exportUserData
  }
`;

export const IMPORT_USER_DATA_MUTATION = `
  mutation ImportUserData($data: String!) {
    importUserData(data: $data) {
      applicationsImported
      applicationsSkipped
      notesImported
      documentsSkipped
    }
  }
`;

export const DELETE_ACCOUNT_MUTATION = `
  mutation DeleteAccount($password: String!) {
    deleteAccount(password: $password)
  }
`;

export const REAUTHENTICATE_MUTATION = `
  mutation Reauthenticate($password: String!, $code: String) {
    reauthenticate(password: $password, code: $code) {
      success
      totpRequired
      accessToken
    }
  }
`;

export const API_TOKENS_QUERY = `
  query ApiTokens {
    apiTokens {
      id
      name
      scope
      lastUsedAt
      createdAt
    }
  }
`;

export const CREATE_API_TOKEN_MUTATION = `
  mutation CreateApiToken($name: String!, $scope: ApiTokenScope) {
    createApiToken(name: $name, scope: $scope) {
      id
      name
      token
      scope
      createdAt
    }
  }
`;

export const DELETE_API_TOKEN_MUTATION = `
  mutation DeleteApiToken($id: ID!) {
    deleteApiToken(id: $id)
  }
`;

export const MCP_OAUTH_GRANTS_QUERY = `
  query McpOAuthGrants {
    mcpOAuthGrants {
      id
      clientName
      scope
      authorizedAt
      lastUsedAt
    }
  }
`;

export const REVOKE_MCP_OAUTH_GRANT_MUTATION = `
  mutation RevokeMcpOAuthGrant($id: ID!) {
    revokeMcpOAuthGrant(id: $id)
  }
`;

export const SHARE_LINKS_QUERY = `
  query ShareLinks {
    shareLinks {
      id
      name
      lastUsedAt
      createdAt
    }
  }
`;

export const CREATE_SHARE_LINK_MUTATION = `
  mutation CreateShareLink($name: String!) {
    createShareLink(name: $name) {
      id
      name
      token
      createdAt
    }
  }
`;

export const DELETE_SHARE_LINK_MUTATION = `
  mutation DeleteShareLink($id: ID!) {
    deleteShareLink(id: $id)
  }
`;

export const WORK_EXPERIENCES_QUERY = `
  query WorkExperiences {
    workExperiences {
      id
      company
      title
      location
      startDate
      endDate
      description
    }
  }
`;

export const CREATE_WORK_EXPERIENCE_MUTATION = `
  mutation CreateWorkExperience($input: CreateWorkExperienceInput!) {
    createWorkExperience(input: $input) {
      id
    }
  }
`;

export const UPDATE_WORK_EXPERIENCE_MUTATION = `
  mutation UpdateWorkExperience($id: ID!, $input: UpdateWorkExperienceInput!) {
    updateWorkExperience(id: $id, input: $input) {
      id
    }
  }
`;

export const DELETE_WORK_EXPERIENCE_MUTATION = `
  mutation DeleteWorkExperience($id: ID!) {
    deleteWorkExperience(id: $id)
  }
`;

export const EDUCATIONS_QUERY = `
  query Educations {
    educations {
      id
      institution
      degree
      field
      startDate
      endDate
      description
    }
  }
`;

export const CREATE_EDUCATION_MUTATION = `
  mutation CreateEducation($input: CreateEducationInput!) {
    createEducation(input: $input) {
      id
    }
  }
`;

export const UPDATE_EDUCATION_MUTATION = `
  mutation UpdateEducation($id: ID!, $input: UpdateEducationInput!) {
    updateEducation(id: $id, input: $input) {
      id
    }
  }
`;

export const DELETE_EDUCATION_MUTATION = `
  mutation DeleteEducation($id: ID!) {
    deleteEducation(id: $id)
  }
`;

export const SKILLS_QUERY = `
  query Skills {
    skills {
      id
      name
      category
      proficiency
    }
  }
`;

export const CREATE_SKILL_MUTATION = `
  mutation CreateSkill($input: CreateSkillInput!) {
    createSkill(input: $input) {
      id
    }
  }
`;

export const DELETE_SKILL_MUTATION = `
  mutation DeleteSkill($id: ID!) {
    deleteSkill(id: $id)
  }
`;
