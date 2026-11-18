import { graphql } from '#/graphql/generated';

/** Documents for Settings → Profile, Notifications, Data and the storage meter. */

export const ME_QUERY = graphql(`
  query Me {
    me {
      id
      email
      name
      timezone
      targetRole
      phone
      location
      profileLinks
      avatarUrl
      backupEmail
      backupEmailVerifiedAt
      hasPassword
    }
  }
`);

export const REQUEST_AVATAR_UPLOAD_URL = graphql(`
  mutation RequestAvatarUploadUrl($filename: String!, $mimeType: String!) {
    requestAvatarUploadUrl(filename: $filename, mimeType: $mimeType) {
      uploadUrl
      storageKey
    }
  }
`);

export const CONFIRM_AVATAR = graphql(`
  mutation ConfirmAvatar($storageKey: String!, $mimeType: String!, $sizeBytes: Int!) {
    confirmAvatar(storageKey: $storageKey, mimeType: $mimeType, sizeBytes: $sizeBytes)
  }
`);

export const REMOVE_AVATAR = graphql(`
  mutation RemoveAvatar {
    removeAvatar
  }
`);

export const UPDATE_PROFILE = graphql(`
  mutation UpdateProfile(
    $name: String
    $timezone: String
    $targetRole: String
    $phone: String
    $location: String
    $profileLinks: [String!]
    $customAiPrompt: String
    $useCrossApplicationContext: Boolean
    $llmFallbackWhenLimited: Boolean
  ) {
    updateProfile(
      name: $name
      timezone: $timezone
      targetRole: $targetRole
      phone: $phone
      location: $location
      profileLinks: $profileLinks
      customAiPrompt: $customAiPrompt
      useCrossApplicationContext: $useCrossApplicationContext
      llmFallbackWhenLimited: $llmFallbackWhenLimited
    )
  }
`);

export const EXPORT_USER_DATA = graphql(`
  query ExportUserData {
    exportUserData
  }
`);

export const IMPORT_USER_DATA = graphql(`
  mutation ImportUserData($data: String!) {
    importUserData(data: $data) {
      applicationsImported
      applicationsSkipped
      notesImported
      documentsSkipped
    }
  }
`);

export const NOTIFICATION_PREFERENCES_QUERY = graphql(`
  query NotificationPreferences {
    notificationPreferences {
      weeklyDigestEnabled
      digestFrequency
      followUpRemindersEnabled
      pushNotificationsEnabled
      weeklyApplicationGoal
    }
  }
`);

export const UPDATE_NOTIFICATION_PREFERENCES = graphql(`
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
`);

export const STORAGE_USAGE_QUERY = graphql(`
  query StorageUsage {
    me {
      storageUsedBytes
      storageLimitBytes
    }
  }
`);
