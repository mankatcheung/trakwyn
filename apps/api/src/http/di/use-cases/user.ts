import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { RequestEmailChangeUseCase } from '#src/use-cases/user/RequestEmailChangeUseCase.js';
import { ConfirmEmailChangeUseCase } from '#src/use-cases/user/ConfirmEmailChangeUseCase.js';
import { UpdatePasswordUseCase } from '#src/use-cases/user/UpdatePasswordUseCase.js';
import { DeleteAccountUseCase } from '#src/use-cases/user/DeleteAccountUseCase.js';
import { ExportUserDataUseCase } from '#src/use-cases/user/ExportUserDataUseCase.js';
import { ImportUserDataUseCase } from '#src/use-cases/user/ImportUserDataUseCase.js';
import { GenerateTotpSecretUseCase } from '#src/use-cases/user/GenerateTotpSecretUseCase.js';
import { ConfirmTotpSetupUseCase } from '#src/use-cases/user/ConfirmTotpSetupUseCase.js';
import { DisableTotpUseCase } from '#src/use-cases/user/DisableTotpUseCase.js';
import { RegenerateTotpBackupCodesUseCase } from '#src/use-cases/user/RegenerateTotpBackupCodesUseCase.js';
import { GetTotpStatusUseCase } from '#src/use-cases/user/GetTotpStatusUseCase.js';
import { SaveLlmApiKeyUseCase } from '#src/use-cases/user/SaveLlmApiKeyUseCase.js';
import { ListLlmApiKeysUseCase } from '#src/use-cases/user/ListLlmApiKeysUseCase.js';
import { DeleteLlmApiKeyUseCase } from '#src/use-cases/user/DeleteLlmApiKeyUseCase.js';
import { SetDefaultLlmProviderUseCase } from '#src/use-cases/user/SetDefaultLlmProviderUseCase.js';
import { SetLlmApiKeyMonthlyLimitUseCase } from '#src/use-cases/user/SetLlmApiKeyMonthlyLimitUseCase.js';
import { TestLlmApiKeyUseCase } from '#src/use-cases/user/TestLlmApiKeyUseCase.js';
import { GetLlmUsageSummaryUseCase } from '#src/use-cases/user/GetLlmUsageSummaryUseCase.js';
import { GetNotificationPreferencesUseCase } from '#src/use-cases/user/GetNotificationPreferencesUseCase.js';
import { UpdateNotificationPreferencesUseCase } from '#src/use-cases/user/UpdateNotificationPreferencesUseCase.js';
import { DismissOnboardingChecklistUseCase } from '#src/use-cases/user/DismissOnboardingChecklistUseCase.js';
import { UpdateProfileUseCase } from '#src/use-cases/user/UpdateProfileUseCase.js';
import { GetUserUseCase } from '#src/use-cases/user/GetUserUseCase.js';
import { RequestAvatarUploadUrlUseCase } from '#src/use-cases/user/RequestAvatarUploadUrlUseCase.js';
import { ConfirmAvatarUseCase } from '#src/use-cases/user/ConfirmAvatarUseCase.js';
import { RemoveAvatarUseCase } from '#src/use-cases/user/RemoveAvatarUseCase.js';
import { GetWeeklyApplicationGoalUseCase } from '#src/use-cases/user/GetWeeklyApplicationGoalUseCase.js';
import { RequestAddBackupEmailUseCase } from '#src/use-cases/user/RequestAddBackupEmailUseCase.js';
import { ConfirmBackupEmailUseCase } from '#src/use-cases/user/ConfirmBackupEmailUseCase.js';
import { RemoveBackupEmailUseCase } from '#src/use-cases/user/RemoveBackupEmailUseCase.js';

import type { Cradle } from '../types.js';

export const user = {
  requestEmailChangeUseCase: asClass(RequestEmailChangeUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  confirmEmailChangeUseCase: asClass(ConfirmEmailChangeUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  updatePasswordUseCase: asClass(UpdatePasswordUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteAccountUseCase: asClass(DeleteAccountUseCase, { lifetime: Lifetime.TRANSIENT }),
  exportUserDataUseCase: asClass(ExportUserDataUseCase, { lifetime: Lifetime.TRANSIENT }),
  generateTotpSecretUseCase: asClass(GenerateTotpSecretUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  confirmTotpSetupUseCase: asClass(ConfirmTotpSetupUseCase, { lifetime: Lifetime.TRANSIENT }),
  disableTotpUseCase: asClass(DisableTotpUseCase, { lifetime: Lifetime.TRANSIENT }),
  regenerateTotpBackupCodesUseCase: asClass(RegenerateTotpBackupCodesUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getTotpStatusUseCase: asClass(GetTotpStatusUseCase, { lifetime: Lifetime.TRANSIENT }),
  saveLlmApiKeyUseCase: asClass(SaveLlmApiKeyUseCase, { lifetime: Lifetime.TRANSIENT }),
  listLlmApiKeysUseCase: asClass(ListLlmApiKeysUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteLlmApiKeyUseCase: asClass(DeleteLlmApiKeyUseCase, { lifetime: Lifetime.TRANSIENT }),
  setDefaultLlmProviderUseCase: asClass(SetDefaultLlmProviderUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  setLlmApiKeyMonthlyLimitUseCase: asClass(SetLlmApiKeyMonthlyLimitUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  testLlmApiKeyUseCase: asClass(TestLlmApiKeyUseCase, { lifetime: Lifetime.TRANSIENT }),
  getLlmUsageSummaryUseCase: asClass(GetLlmUsageSummaryUseCase, { lifetime: Lifetime.TRANSIENT }),
  importUserDataUseCase: asClass(ImportUserDataUseCase, { lifetime: Lifetime.TRANSIENT }),
  getNotificationPreferencesUseCase: asClass(GetNotificationPreferencesUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  updateNotificationPreferencesUseCase: asClass(UpdateNotificationPreferencesUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  dismissOnboardingChecklistUseCase: asClass(DismissOnboardingChecklistUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  updateProfileUseCase: asClass(UpdateProfileUseCase, { lifetime: Lifetime.TRANSIENT }),
  getUserUseCase: asClass(GetUserUseCase, { lifetime: Lifetime.TRANSIENT }),
  requestAvatarUploadUrlUseCase: asClass(RequestAvatarUploadUrlUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  confirmAvatarUseCase: asClass(ConfirmAvatarUseCase, { lifetime: Lifetime.TRANSIENT }),
  removeAvatarUseCase: asClass(RemoveAvatarUseCase, { lifetime: Lifetime.TRANSIENT }),
  getWeeklyApplicationGoalUseCase: asClass(GetWeeklyApplicationGoalUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  requestAddBackupEmailUseCase: asClass(RequestAddBackupEmailUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  confirmBackupEmailUseCase: asClass(ConfirmBackupEmailUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  removeBackupEmailUseCase: asClass(RemoveBackupEmailUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
