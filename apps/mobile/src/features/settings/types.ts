export interface Profile {
  id: string;
  email: string;
  name: string | null;
  timezone: string | null;
  targetRole: string | null;
  avatarUrl: string | null;
  backupEmail: string | null;
  backupEmailVerifiedAt: string | null;
}

export interface RequestAvatarUploadUrlResult {
  uploadUrl: string;
  storageKey: string;
}

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  deviceLabel: string | null;
  location: string | null;
  lastUsedAt: string;
  current: boolean;
}

/** Mirrors the API's `OAuthProvider` enum (see apps/api's OAuthProviderEnum). */
export type OAuthProvider = 'google' | 'github';

export interface LinkedOAuthAccount {
  provider: OAuthProvider;
  email: string | null;
  createdAt: string;
}

export type DigestFrequency = 'DAILY' | 'WEEKLY' | 'OFF';

export interface NotificationPreferences {
  digestFrequency: DigestFrequency;
  followUpRemindersEnabled: boolean;
  pushNotificationsEnabled: boolean;
  weeklyApplicationGoal: number | null;
}

export interface LlmApiKey {
  provider: string;
  model: string | null;
  baseUrl: string | null;
}

export const LLM_PROVIDERS = ['openai', 'anthropic', 'googleai', 'openrouter', 'custom'] as const;

export const LLM_PROVIDER_LABEL: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  googleai: 'Google AI',
  openrouter: 'OpenRouter',
  mistral: 'Mistral',
  groq: 'Groq',
  xai: 'xAI',
  deepseek: 'DeepSeek',
  nvidia: 'NVIDIA',
  custom: 'Custom (OpenAI-compatible)',
};

export interface ImportSummary {
  applicationsImported: number;
  applicationsSkipped: number;
  notesImported: number;
  documentsSkipped: number;
}

export type ReauthenticateResult = {
  success: boolean;
  totpRequired: boolean;
  accessToken: string | null;
};

/** Mirrors the API's `ApiTokenScope` enum. */
export type ApiTokenScope = 'read' | 'full';

export interface ApiToken {
  id: string;
  name: string;
  scope: ApiTokenScope;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateApiTokenPayload {
  id: string;
  name: string;
  token: string;
  scope: ApiTokenScope;
  createdAt: string;
}

export interface McpOAuthGrant {
  id: string;
  clientName: string;
  scope: ApiTokenScope;
  authorizedAt: string;
  lastUsedAt: string | null;
}

export interface ShareLink {
  id: string;
  name: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface CreateShareLinkPayload {
  id: string;
  name: string;
  token: string;
  createdAt: string;
}

export interface WorkExperience {
  id: string;
  company: string;
  title: string;
  location: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
}

export interface CreateWorkExperienceInput {
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  description?: string;
}

export interface Education {
  id: string;
  institution: string;
  degree: string | null;
  field: string | null;
  startDate: string;
  endDate: string | null;
  description: string | null;
}

export interface CreateEducationInput {
  institution: string;
  degree?: string;
  field?: string;
  startDate: string;
  endDate?: string;
  description?: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string | null;
  proficiency: string | null;
}

export interface CreateSkillInput {
  name: string;
  category?: string;
  proficiency?: string;
}
