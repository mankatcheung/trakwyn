import type { DeviceInfo } from '#src/interface-adapters/resolvers/AuthResolver.js';
import type { IRequestEmailChangeUseCase } from '#src/use-cases/user/IRequestEmailChangeUseCase.js';
import type { IConfirmEmailChangeUseCase } from '#src/use-cases/user/IConfirmEmailChangeUseCase.js';
import type { IUpdatePasswordUseCase } from '#src/use-cases/user/IUpdatePasswordUseCase.js';
import type { IDeleteAccountUseCase } from '#src/use-cases/user/IDeleteAccountUseCase.js';
import type {
  IExportUserDataUseCase,
  ExportUserDataOutput,
} from '#src/use-cases/user/IExportUserDataUseCase.js';
import type {
  IGenerateTotpSecretUseCase,
  TotpSetup,
} from '#src/use-cases/user/IGenerateTotpSecretUseCase.js';
import type {
  IConfirmTotpSetupUseCase,
  ConfirmTotpSetupOutput,
} from '#src/use-cases/user/IConfirmTotpSetupUseCase.js';
import type { IDisableTotpUseCase } from '#src/use-cases/user/IDisableTotpUseCase.js';
import type {
  IRegenerateTotpBackupCodesUseCase,
  RegenerateTotpBackupCodesOutput,
} from '#src/use-cases/user/IRegenerateTotpBackupCodesUseCase.js';
import type { IGetTotpStatusUseCase } from '#src/use-cases/user/IGetTotpStatusUseCase.js';
import type { ISaveLlmApiKeyUseCase } from '#src/use-cases/user/ISaveLlmApiKeyUseCase.js';
import type { IListLlmApiKeysUseCase } from '#src/use-cases/user/IListLlmApiKeysUseCase.js';
import type { IDeleteLlmApiKeyUseCase } from '#src/use-cases/user/IDeleteLlmApiKeyUseCase.js';
import type { ISetLlmApiKeyMonthlyLimitUseCase } from '#src/use-cases/user/ISetLlmApiKeyMonthlyLimitUseCase.js';
import type { ISetDefaultLlmProviderUseCase } from '#src/use-cases/user/ISetDefaultLlmProviderUseCase.js';
import type {
  ITestLlmApiKeyUseCase,
  TestLlmApiKeyResult,
} from '#src/use-cases/user/ITestLlmApiKeyUseCase.js';
import type { IGetLlmUsageSummaryUseCase } from '#src/use-cases/user/IGetLlmUsageSummaryUseCase.js';
import {
  LlmUsageSummaryMapper,
  type LlmUsageSummaryDTO,
} from '#src/interface-adapters/mappers/LlmUsageSummaryMapper.js';
import {
  LlmApiKeyMapper,
  type LlmApiKeyDTO,
} from '#src/interface-adapters/mappers/LlmApiKeyMapper.js';
import type {
  IImportUserDataUseCase,
  ImportSummary,
} from '#src/use-cases/user/IImportUserDataUseCase.js';
import type {
  IGetNotificationPreferencesUseCase,
  NotificationPreferences,
} from '#src/use-cases/user/IGetNotificationPreferencesUseCase.js';
import type { IUpdateNotificationPreferencesUseCase } from '#src/use-cases/user/IUpdateNotificationPreferencesUseCase.js';
import type { IDismissOnboardingChecklistUseCase } from '#src/use-cases/user/IDismissOnboardingChecklistUseCase.js';
import type { IUpdateProfileUseCase } from '#src/use-cases/user/IUpdateProfileUseCase.js';
import type { IGetUserUseCase } from '#src/use-cases/user/IGetUserUseCase.js';
import type {
  IRequestAvatarUploadUrlUseCase,
  RequestAvatarUploadUrlOutput,
} from '#src/use-cases/user/IRequestAvatarUploadUrlUseCase.js';
import type { IConfirmAvatarUseCase } from '#src/use-cases/user/IConfirmAvatarUseCase.js';
import type { IRemoveAvatarUseCase } from '#src/use-cases/user/IRemoveAvatarUseCase.js';
import type {
  IGetWeeklyApplicationGoalUseCase,
  WeeklyApplicationGoalStats,
} from '#src/use-cases/user/IGetWeeklyApplicationGoalUseCase.js';
import type { IRequestAddBackupEmailUseCase } from '#src/use-cases/user/IRequestAddBackupEmailUseCase.js';
import type { IConfirmBackupEmailUseCase } from '#src/use-cases/user/IConfirmBackupEmailUseCase.js';
import type { IRemoveBackupEmailUseCase } from '#src/use-cases/user/IRemoveBackupEmailUseCase.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import { UserMapper, type UserDTO } from '#src/interface-adapters/mappers/UserMapper.js';

interface Deps {
  requestEmailChangeUseCase: IRequestEmailChangeUseCase;
  confirmEmailChangeUseCase: IConfirmEmailChangeUseCase;
  updatePasswordUseCase: IUpdatePasswordUseCase;
  deleteAccountUseCase: IDeleteAccountUseCase;
  exportUserDataUseCase: IExportUserDataUseCase;
  generateTotpSecretUseCase: IGenerateTotpSecretUseCase;
  confirmTotpSetupUseCase: IConfirmTotpSetupUseCase;
  disableTotpUseCase: IDisableTotpUseCase;
  regenerateTotpBackupCodesUseCase?: IRegenerateTotpBackupCodesUseCase;
  getTotpStatusUseCase: IGetTotpStatusUseCase;
  saveLlmApiKeyUseCase: ISaveLlmApiKeyUseCase;
  listLlmApiKeysUseCase: IListLlmApiKeysUseCase;
  deleteLlmApiKeyUseCase: IDeleteLlmApiKeyUseCase;
  setDefaultLlmProviderUseCase: ISetDefaultLlmProviderUseCase;
  setLlmApiKeyMonthlyLimitUseCase: ISetLlmApiKeyMonthlyLimitUseCase;
  testLlmApiKeyUseCase: ITestLlmApiKeyUseCase;
  getLlmUsageSummaryUseCase: IGetLlmUsageSummaryUseCase;
  llmApiKeyMapper: LlmApiKeyMapper;
  llmUsageSummaryMapper: LlmUsageSummaryMapper;
  importUserDataUseCase: IImportUserDataUseCase;
  getNotificationPreferencesUseCase: IGetNotificationPreferencesUseCase;
  updateNotificationPreferencesUseCase: IUpdateNotificationPreferencesUseCase;
  dismissOnboardingChecklistUseCase: IDismissOnboardingChecklistUseCase;
  updateProfileUseCase: IUpdateProfileUseCase;
  getUserUseCase: IGetUserUseCase;
  requestAvatarUploadUrlUseCase: IRequestAvatarUploadUrlUseCase;
  confirmAvatarUseCase: IConfirmAvatarUseCase;
  removeAvatarUseCase: IRemoveAvatarUseCase;
  getWeeklyApplicationGoalUseCase?: IGetWeeklyApplicationGoalUseCase;
  requestAddBackupEmailUseCase: IRequestAddBackupEmailUseCase;
  confirmBackupEmailUseCase: IConfirmBackupEmailUseCase;
  removeBackupEmailUseCase: IRemoveBackupEmailUseCase;
  storageProvider: IStorageProvider;
  userMapper: UserMapper;
}

export class UserResolver {
  constructor(private readonly deps: Deps) {}

  async requestEmailChange(
    userId: string,
    currentPassword: string,
    newEmail: string,
    authTime: number | null | undefined,
  ): Promise<void> {
    await this.deps.requestEmailChangeUseCase.execute({
      userId,
      currentPassword,
      newEmail,
      authTime,
    });
  }

  async confirmEmailChange(token: string, device: DeviceInfo): Promise<void> {
    await this.deps.confirmEmailChangeUseCase.execute({
      token,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    authTime: number | null | undefined,
    device: DeviceInfo,
  ): Promise<void> {
    await this.deps.updatePasswordUseCase.execute({
      userId,
      currentPassword,
      newPassword,
      authTime,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
  }

  async deleteAccount(
    userId: string,
    password: string,
    authTime: number | null | undefined,
  ): Promise<void> {
    await this.deps.deleteAccountUseCase.execute({ userId, password, authTime });
  }

  async exportUserData(userId: string): Promise<ExportUserDataOutput> {
    return this.deps.exportUserDataUseCase.execute(userId);
  }

  async beginTotpSetup(userId: string, password: string): Promise<TotpSetup> {
    return this.deps.generateTotpSecretUseCase.execute({ userId, password });
  }

  async confirmTotpSetup(
    userId: string,
    code: string,
    device: DeviceInfo,
  ): Promise<ConfirmTotpSetupOutput> {
    return this.deps.confirmTotpSetupUseCase.execute({
      userId,
      code,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
  }

  async disableTotp(userId: string, password: string, device: DeviceInfo): Promise<void> {
    await this.deps.disableTotpUseCase.execute({
      userId,
      password,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
  }

  async regenerateTotpBackupCodes(
    userId: string,
    currentPassword: string,
    authTime: number | null | undefined,
    device: DeviceInfo,
  ): Promise<RegenerateTotpBackupCodesOutput> {
    if (!this.deps.regenerateTotpBackupCodesUseCase) {
      throw new Error('Regenerate TOTP backup codes use case is not configured');
    }
    return this.deps.regenerateTotpBackupCodesUseCase.execute({
      userId,
      currentPassword,
      authTime,
      ipAddress: device.ipAddress,
      userAgent: device.userAgent,
    });
  }

  async getTotpStatus(userId: string): Promise<boolean> {
    return this.deps.getTotpStatusUseCase.execute(userId);
  }

  async saveLlmApiKey(
    userId: string,
    provider: string,
    apiKey: string,
    model?: string | null,
    baseUrl?: string | null,
  ): Promise<void> {
    await this.deps.saveLlmApiKeyUseCase.execute({ userId, provider, apiKey, model, baseUrl });
  }

  async listLlmApiKeys(userId: string): Promise<LlmApiKeyDTO[]> {
    const keys = await this.deps.listLlmApiKeysUseCase.execute(userId);
    return keys.map((key) => this.deps.llmApiKeyMapper.toDTO(key));
  }

  async getLlmUsageSummary(userId: string): Promise<LlmUsageSummaryDTO[]> {
    const summary = await this.deps.getLlmUsageSummaryUseCase.execute(userId);
    return summary.map((s) => this.deps.llmUsageSummaryMapper.toDTO(s));
  }

  async deleteLlmApiKey(userId: string, provider: string): Promise<void> {
    await this.deps.deleteLlmApiKeyUseCase.execute({ userId, provider });
  }

  async setDefaultLlmProvider(userId: string, provider: string): Promise<void> {
    await this.deps.setDefaultLlmProviderUseCase.execute({ userId, provider });
  }

  async setLlmApiKeyMonthlyLimit(
    userId: string,
    provider: string,
    monthlyTokenLimit: number | null,
  ): Promise<void> {
    await this.deps.setLlmApiKeyMonthlyLimitUseCase.execute({
      userId,
      provider,
      monthlyTokenLimit,
    });
  }

  async testLlmApiKey(
    userId: string,
    provider: string,
    apiKey?: string | null,
    model?: string | null,
    baseUrl?: string | null,
  ): Promise<TestLlmApiKeyResult> {
    return this.deps.testLlmApiKeyUseCase.execute({ userId, provider, apiKey, model, baseUrl });
  }

  async importUserData(userId: string, rawData: string): Promise<ImportSummary> {
    return this.deps.importUserDataUseCase.execute(userId, rawData);
  }

  async getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    return this.deps.getNotificationPreferencesUseCase.execute(userId);
  }

  async getWeeklyApplicationGoal(userId: string): Promise<WeeklyApplicationGoalStats> {
    if (!this.deps.getWeeklyApplicationGoalUseCase) {
      throw new Error('Weekly application goal use case is not configured');
    }
    return this.deps.getWeeklyApplicationGoalUseCase.execute(userId);
  }

  async updateNotificationPreferences(
    userId: string,
    weeklyDigestEnabled?: boolean,
    followUpRemindersEnabled?: boolean,
    pushNotificationsEnabled?: boolean,
    weeklyApplicationGoalOrDigestFrequency?: number | 'daily' | 'weekly' | 'off',
    digestFrequency?: 'daily' | 'weekly' | 'off',
  ): Promise<void> {
    await this.deps.updateNotificationPreferencesUseCase.execute({
      userId,
      weeklyDigestEnabled,
      followUpRemindersEnabled,
      pushNotificationsEnabled,
      weeklyApplicationGoal:
        typeof weeklyApplicationGoalOrDigestFrequency === 'number'
          ? weeklyApplicationGoalOrDigestFrequency
          : undefined,
      digestFrequency:
        typeof weeklyApplicationGoalOrDigestFrequency === 'string'
          ? weeklyApplicationGoalOrDigestFrequency
          : digestFrequency,
    });
  }

  async dismissOnboardingChecklist(userId: string): Promise<void> {
    await this.deps.dismissOnboardingChecklistUseCase.execute(userId);
  }

  async updateProfile(
    userId: string,
    name?: string | null,
    timezone?: string | null,
    targetRole?: string | null,
    customAiPrompt?: string | null,
    useCrossApplicationContext?: boolean,
    llmFallbackWhenLimited?: boolean,
  ): Promise<void> {
    await this.deps.updateProfileUseCase.execute({
      userId,
      name,
      timezone,
      targetRole,
      customAiPrompt,
      useCrossApplicationContext,
      llmFallbackWhenLimited,
    });
  }

  async getMe(userId: string): Promise<UserDTO | null> {
    const user = await this.deps.getUserUseCase.execute(userId);
    if (!user) return null;
    const avatarUrl = user.avatarKey
      ? await this.deps.storageProvider.getSignedUrl(user.avatarKey)
      : null;
    return this.deps.userMapper.toDTO(user, avatarUrl);
  }

  async requestAvatarUploadUrl(
    userId: string,
    filename: string,
    mimeType: string,
  ): Promise<RequestAvatarUploadUrlOutput> {
    return this.deps.requestAvatarUploadUrlUseCase.execute({ userId, filename, mimeType });
  }

  async confirmAvatar(
    userId: string,
    storageKey: string,
    mimeType: string,
    sizeBytes: number,
  ): Promise<string> {
    await this.deps.confirmAvatarUseCase.execute({ userId, storageKey, mimeType, sizeBytes });
    return this.deps.storageProvider.getSignedUrl(storageKey);
  }

  async removeAvatar(userId: string): Promise<void> {
    await this.deps.removeAvatarUseCase.execute(userId);
  }

  async requestAddBackupEmail(
    userId: string,
    backupEmail: string,
    currentPassword: string,
    authTime: number | null | undefined,
  ): Promise<void> {
    await this.deps.requestAddBackupEmailUseCase.execute({
      userId,
      backupEmail,
      currentPassword,
      authTime,
    });
  }

  async confirmBackupEmail(token: string): Promise<void> {
    await this.deps.confirmBackupEmailUseCase.execute({ token });
  }

  async removeBackupEmail(
    userId: string,
    currentPassword: string,
    authTime: number | null | undefined,
  ): Promise<void> {
    await this.deps.removeBackupEmailUseCase.execute({
      userId,
      currentPassword,
      authTime,
    });
  }
}
