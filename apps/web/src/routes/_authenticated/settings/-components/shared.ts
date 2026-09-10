import { z } from 'zod';

// ── GraphQL queries & mutations ────────────────────────────────────────────

export const ME_QUERY = `
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

export const REQUEST_AVATAR_UPLOAD_URL = `
  mutation RequestAvatarUploadUrl($filename: String!, $mimeType: String!) {
    requestAvatarUploadUrl(filename: $filename, mimeType: $mimeType) {
      uploadUrl
      storageKey
    }
  }
`;

export const CONFIRM_AVATAR = `
  mutation ConfirmAvatar($storageKey: String!, $mimeType: String!, $sizeBytes: Int!) {
    confirmAvatar(storageKey: $storageKey, mimeType: $mimeType, sizeBytes: $sizeBytes)
  }
`;

export const REMOVE_AVATAR = `
  mutation RemoveAvatar {
    removeAvatar
  }
`;

export const UPDATE_PROFILE = `
  mutation UpdateProfile(
    $name: String
    $timezone: String
    $targetRole: String
    $customAiPrompt: String
    $useCrossApplicationContext: Boolean
    $llmFallbackWhenLimited: Boolean
  ) {
    updateProfile(
      name: $name
      timezone: $timezone
      targetRole: $targetRole
      customAiPrompt: $customAiPrompt
      useCrossApplicationContext: $useCrossApplicationContext
      llmFallbackWhenLimited: $llmFallbackWhenLimited
    )
  }
`;

export const REQUEST_EMAIL_CHANGE = `
  mutation RequestEmailChange($currentPassword: String!, $newEmail: String!) {
    requestEmailChange(currentPassword: $currentPassword, newEmail: $newEmail)
  }
`;

export const REQUEST_ADD_BACKUP_EMAIL = `
  mutation RequestAddBackupEmail($currentPassword: String!, $backupEmail: String!) {
    requestAddBackupEmail(currentPassword: $currentPassword, backupEmail: $backupEmail)
  }
`;

export const REMOVE_BACKUP_EMAIL = `
  mutation RemoveBackupEmail($currentPassword: String!) {
    removeBackupEmail(currentPassword: $currentPassword)
  }
`;

export const UPDATE_PASSWORD = `
  mutation UpdatePassword($currentPassword: String!, $newPassword: String!) {
    updatePassword(currentPassword: $currentPassword, newPassword: $newPassword)
  }
`;

export const DELETE_ACCOUNT = `
  mutation DeleteAccount($password: String!) {
    deleteAccount(password: $password)
  }
`;

export const REAUTHENTICATE = `
  mutation Reauthenticate($password: String!, $code: String) {
    reauthenticate(password: $password, code: $code) {
      success
      totpRequired
      accessToken
    }
  }
`;

export const EXPORT_USER_DATA = `
  query ExportUserData {
    exportUserData
  }
`;

export const SECURITY_ACTIVITY = `
  query SecurityActivity {
    securityActivity {
      id
      eventType
      ipAddress
      userAgent
      createdAt
    }
  }
`;

export const IMPORT_USER_DATA = `
  mutation ImportUserData($data: String!) {
    importUserData(data: $data) {
      applicationsImported
      applicationsSkipped
      notesImported
      documentsSkipped
    }
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

export const REVOKE_SESSION = `
  mutation RevokeSession($id: ID!) {
    revokeSession(id: $id)
  }
`;

export const REVOKE_OTHER_SESSIONS = `
  mutation RevokeOtherSessions {
    revokeOtherSessions
  }
`;

export const NOTIFICATION_PREFERENCES_QUERY = `
  query NotificationPreferences {
    notificationPreferences {
      weeklyDigestEnabled
      digestFrequency
      followUpRemindersEnabled
      pushNotificationsEnabled
      weeklyApplicationGoal
    }
  }
`;

export const UPDATE_NOTIFICATION_PREFERENCES = `
  mutation UpdateNotificationPreferences($weeklyDigestEnabled: Boolean, $digestFrequency: DigestFrequency, $followUpRemindersEnabled: Boolean, $pushNotificationsEnabled: Boolean, $weeklyApplicationGoal: Int) {
    updateNotificationPreferences(
      digestFrequency: $digestFrequency
      followUpRemindersEnabled: $followUpRemindersEnabled
      pushNotificationsEnabled: $pushNotificationsEnabled
      weeklyApplicationGoal: $weeklyApplicationGoal
    )
  }
`;

export const TOTP_ENABLED_QUERY = `
  query TotpEnabled {
    totpEnabled
  }
`;

export const BEGIN_TOTP_SETUP = `
  mutation BeginTotpSetup($password: String!) {
    beginTotpSetup(password: $password) {
      secret
      otpauthUrl
      qrCodeDataUrl
    }
  }
`;

export const CONFIRM_TOTP_SETUP = `
  mutation ConfirmTotpSetup($code: String!) {
    confirmTotpSetup(code: $code) {
      backupCodes
    }
  }
`;

export const DISABLE_TOTP = `
  mutation DisableTotp($password: String!) {
    disableTotp(password: $password)
  }
`;

export const REGENERATE_TOTP_BACKUP_CODES = `
  mutation RegenerateTotpBackupCodes($currentPassword: String!) {
    regenerateTotpBackupCodes(currentPassword: $currentPassword) {
      backupCodes
    }
  }
`;

export const LLM_API_KEYS_QUERY = `
  query LlmApiKeys {
    llmApiKeys {
      provider
      model
      baseUrl
      monthlyTokenLimit
    }
    me {
      defaultLlmProvider
      customAiPrompt
      useCrossApplicationContext
      llmFallbackWhenLimited
    }
  }
`;

export const SAVE_LLM_API_KEY = `
  mutation SaveLlmApiKey($provider: String!, $apiKey: String!, $model: String, $baseUrl: String) {
    saveLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl)
  }
`;

export const DELETE_LLM_API_KEY = `
  mutation DeleteLlmApiKey($provider: String!) {
    deleteLlmApiKey(provider: $provider)
  }
`;

export const SET_DEFAULT_LLM_PROVIDER = `
  mutation SetDefaultLlmProvider($provider: String!) {
    setDefaultLlmProvider(provider: $provider)
  }
`;

export const SET_LLM_API_KEY_MONTHLY_LIMIT = `
  mutation SetLlmApiKeyMonthlyLimit($provider: String!, $monthlyTokenLimit: Int) {
    setLlmApiKeyMonthlyLimit(provider: $provider, monthlyTokenLimit: $monthlyTokenLimit)
  }
`;

export const TEST_LLM_API_KEY = `
  mutation TestLlmApiKey($provider: String!, $apiKey: String, $model: String, $baseUrl: String) {
    testLlmApiKey(provider: $provider, apiKey: $apiKey, model: $model, baseUrl: $baseUrl) {
      ok
      error
    }
  }
`;

export const LLM_USAGE_SUMMARY_QUERY = `
  query LlmUsageSummary {
    llmUsageSummary {
      provider
      requestCount
      promptTokens
      completionTokens
      cacheReadTokens
      cacheWriteTokens
      lastUsedAt
      monthlyTokenLimit
      limitReached
    }
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

export const UNLINK_OAUTH_ACCOUNT = `
  mutation UnlinkOAuthAccount($provider: OAuthProvider!) {
    unlinkOAuthAccount(provider: $provider)
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

export const CREATE_API_TOKEN = `
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

export const DELETE_API_TOKEN = `
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

export const REVOKE_MCP_OAUTH_GRANT = `
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

export const CREATE_SHARE_LINK = `
  mutation CreateShareLink($name: String!) {
    createShareLink(name: $name) {
      id
      name
      token
      createdAt
    }
  }
`;

export const DELETE_SHARE_LINK = `
  mutation DeleteShareLink($id: ID!) {
    deleteShareLink(id: $id)
  }
`;

// ── Schemas ────────────────────────────────────────────────────────────────

export const profileSchema = z.object({
  name: z.string().max(100, 'Name is too long'),
  timezone: z.string(),
  targetRole: z.string().max(100, 'Target role is too long'),
});

// Mirrors MAX_AI_PROMPT_LENGTH in apps/api's UpdateProfileUseCase — this repo
// doesn't share validation constants across the API/web boundary.
export const MAX_AI_PROMPT_LENGTH = 500;

export const customAiPromptSchema = z.object({
  customAiPrompt: z
    .string()
    .max(MAX_AI_PROMPT_LENGTH, `Must be ${MAX_AI_PROMPT_LENGTH} characters or fewer`),
});

export const emailSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  newEmail: z.string().email('Invalid email'),
});

export const backupEmailSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
  backupEmail: z.string().email('Invalid email'),
});

export const removeBackupEmailSchema = z.object({
  currentPassword: z.string().min(1, 'Required'),
});

export const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const deleteSchema = z.object({
  password: z.string().min(1, 'Required'),
});

export const reauthSchema = z.object({
  password: z.string().min(1, 'Required'),
  code: z.string().optional(),
});

export const totpBeginSchema = z.object({
  password: z.string().min(1, 'Required'),
});

export const totpConfirmSchema = z.object({
  code: z.string().min(6, 'Enter the 6-digit code').max(6, 'Enter the 6-digit code'),
});

export const totpDisableSchema = z.object({
  password: z.string().min(1, 'Required'),
});

export const CUSTOM_LLM_PROVIDER = 'custom';

export const llmApiKeySchema = z
  .object({
    provider: z.enum([
      'openai',
      'anthropic',
      'googleai',
      'openrouter',
      'mistral',
      'groq',
      'xai',
      'deepseek',
      'nvidia',
      'custom',
    ]),
    apiKey: z.string().min(1, 'Required'),
    model: z.string().optional(),
    baseUrl: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const isCustom = data.provider === CUSTOM_LLM_PROVIDER;
    if (isCustom && !data.model?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Required for a custom provider',
        path: ['model'],
      });
    }
    if (isCustom) {
      if (!data.baseUrl?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Required for a custom provider',
          path: ['baseUrl'],
        });
      } else if (!/^https?:\/\//.test(data.baseUrl.trim())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Must start with http:// or https://',
          path: ['baseUrl'],
        });
      }
    } else if (data.baseUrl?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only valid for a custom provider',
        path: ['baseUrl'],
      });
    }
  });

// ── Types ──────────────────────────────────────────────────────────────────

export type ProfileForm = z.infer<typeof profileSchema>;
export type CustomAiPromptForm = z.infer<typeof customAiPromptSchema>;
export type EmailForm = z.infer<typeof emailSchema>;
export type BackupEmailForm = z.infer<typeof backupEmailSchema>;
export type RemoveBackupEmailForm = z.infer<typeof removeBackupEmailSchema>;
export type PasswordForm = z.infer<typeof passwordSchema>;
export type DeleteForm = z.infer<typeof deleteSchema>;
export type ReauthForm = z.infer<typeof reauthSchema>;
export type TotpBeginForm = z.infer<typeof totpBeginSchema>;
export type TotpConfirmForm = z.infer<typeof totpConfirmSchema>;
export type TotpDisableForm = z.infer<typeof totpDisableSchema>;
export type LlmApiKeyForm = z.infer<typeof llmApiKeySchema>;

export type TotpSetup = { secret: string; otpauthUrl: string; qrCodeDataUrl: string };

export type LlmApiKey = {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  /** Monthly prompt+completion token ceiling; null means no limit (JEF-258). */
  monthlyTokenLimit: number | null;
};

export type TestLlmApiKeyResult = {
  ok: boolean;
  error: string | null;
};

export type LlmUsageSummary = {
  provider: string;
  requestCount: number;
  promptTokens: number;
  completionTokens: number;
  /** Share of promptTokens served from / written to the provider's prompt cache this month. */
  cacheReadTokens: number;
  cacheWriteTokens: number;
  lastUsedAt: string;
  monthlyTokenLimit: number | null;
  /**
   * Decided by the API from the same helper the provider factory refuses on,
   * so this and the meter beside it cannot disagree with what a call does.
   */
  limitReached: boolean;
};

export const LLM_PROVIDER_OPTIONS: { value: string; label: string }[] = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'googleai', label: 'Google AI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'groq', label: 'Groq' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'nvidia', label: 'NVIDIA NIM' },
  { value: CUSTOM_LLM_PROVIDER, label: 'Custom (OpenAI-compatible)' },
];

export const LLM_PROVIDER_LABEL: Record<string, string> = Object.fromEntries(
  LLM_PROVIDER_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * A small colored monogram per provider, purely a visual scanning aid in the
 * saved-keys list — not a brand mark (no logos), so it's safe to invent.
 * Reuses the exact tone pairs `Badge`'s `TONE_CLASSES` defines, for the same
 * "light bg-100/text-700, dark bg-900/30/text-400" look used everywhere else
 * a status color appears. 10 providers over 9 tones — `custom` intentionally
 * doubles up with `deepseek`'s neutral gray, since "custom" has no brand of
 * its own to distinguish.
 */
export const LLM_PROVIDER_AVATAR: Record<string, { initials: string; className: string }> = {
  openai: {
    initials: 'AI',
    className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  anthropic: {
    initials: 'AN',
    className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  },
  googleai: {
    initials: 'G',
    className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  },
  openrouter: {
    initials: 'OR',
    className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  },
  mistral: {
    initials: 'MI',
    className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  },
  groq: {
    initials: 'GQ',
    className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  },
  xai: {
    initials: 'X',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  deepseek: {
    initials: 'DS',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
  nvidia: {
    initials: 'NV',
    className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  },
  [CUSTOM_LLM_PROVIDER]: {
    initials: 'C',
    className: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  },
};

export interface SecurityActivityItem {
  id: string;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

/** Device-kind key for a session/security-event's user agent string — translate via `security.device.<kind>` at the call site. */
export type DeviceKind = 'ios' | 'android' | 'mac' | 'windows' | 'linux' | 'unknown';

export function describeDevice(userAgent: string | null): DeviceKind {
  if (!userAgent) return 'unknown';
  if (/iPhone|iPad/.test(userAgent)) return 'ios';
  if (/Android/.test(userAgent)) return 'android';
  if (/Macintosh/.test(userAgent)) return 'mac';
  if (/Windows/.test(userAgent)) return 'windows';
  if (/Linux/.test(userAgent)) return 'linux';
  return 'unknown';
}

export interface ImportSummary {
  applicationsImported: number;
  applicationsSkipped: number;
  notesImported: number;
  documentsSkipped: number;
}

export type Session = {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
  location: string | null;
  lastUsedAt: string;
  current: boolean;
};

export type Me = {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  targetRole: string | null;
  avatarUrl: string | null;
  backupEmail: string | null;
  backupEmailVerifiedAt: string | null;
};

export type NotificationPreferences = {
  weeklyDigestEnabled: boolean;
  digestFrequency: 'daily' | 'weekly' | 'off';
  followUpRemindersEnabled: boolean;
  pushNotificationsEnabled: boolean;
  weeklyApplicationGoal: number;
};

export type LinkedOAuthAccount = {
  provider: 'google' | 'github';
  email: string | null;
  createdAt: string;
};

/** Mirrors the API's `ApiTokenScope` enum (`API_TOKEN_SCOPE` in apps/api/src/constants.ts). */
export type ApiTokenScope = 'read' | 'full';

export type ApiToken = {
  id: string;
  name: string;
  scope: ApiTokenScope;
  lastUsedAt: string | null;
  createdAt: string;
};

/** One MCP client the user authorized over OAuth. `id` is the grant id. */
export type McpOAuthGrant = {
  id: string;
  clientName: string;
  scope: ApiTokenScope;
  authorizedAt: string;
  lastUsedAt: string | null;
};

export type CreateApiTokenPayload = {
  id: string;
  name: string;
  token: string;
  scope: string;
  createdAt: string;
};

export type ShareLink = {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
};

export type CreateShareLinkPayload = {
  id: string;
  name: string;
  token: string;
  createdAt: string;
};

// ── Shared styles ──────────────────────────────────────────────────────────

export const inputCls =
  'w-full min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

export function extractGqlError(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: Array<{ message?: string }> } }).response;
    return r?.errors?.[0]?.message ?? null;
  }
  return null;
}

/** Extracts the GraphQL `extensions.code` from a graphql-request error, e.g. `STEP_UP_REQUIRED` (JEF-44). */
export function extractGqlErrorCode(err: unknown): string | null {
  if (typeof err === 'object' && err !== null && 'response' in err) {
    const r = (err as { response?: { errors?: Array<{ extensions?: { code?: string } }> } })
      .response;
    return r?.errors?.[0]?.extensions?.code ?? null;
  }
  return null;
}

export type ReauthenticateResult = {
  success: boolean;
  totpRequired: boolean;
  accessToken: string | null;
};
