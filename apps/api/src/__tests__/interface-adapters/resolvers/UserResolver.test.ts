import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserResolver } from '#src/interface-adapters/resolvers/UserResolver.js';
import type { IRequestEmailChangeUseCase } from '#src/use-cases/user/IRequestEmailChangeUseCase.js';
import type { IConfirmEmailChangeUseCase } from '#src/use-cases/user/IConfirmEmailChangeUseCase.js';
import type { IUpdatePasswordUseCase } from '#src/use-cases/user/IUpdatePasswordUseCase.js';
import type { IDeleteAccountUseCase } from '#src/use-cases/user/IDeleteAccountUseCase.js';
import type { IExportUserDataUseCase } from '#src/use-cases/user/IExportUserDataUseCase.js';
import type { IGenerateTotpSecretUseCase } from '#src/use-cases/user/IGenerateTotpSecretUseCase.js';
import type { IConfirmTotpSetupUseCase } from '#src/use-cases/user/IConfirmTotpSetupUseCase.js';
import type { IDisableTotpUseCase } from '#src/use-cases/user/IDisableTotpUseCase.js';
import type { IGetTotpStatusUseCase } from '#src/use-cases/user/IGetTotpStatusUseCase.js';
import type { ISaveLlmApiKeyUseCase } from '#src/use-cases/user/ISaveLlmApiKeyUseCase.js';
import type { IListLlmApiKeysUseCase } from '#src/use-cases/user/IListLlmApiKeysUseCase.js';
import type { IDeleteLlmApiKeyUseCase } from '#src/use-cases/user/IDeleteLlmApiKeyUseCase.js';
import type { ISetLlmApiKeyMonthlyLimitUseCase } from '#src/use-cases/user/ISetLlmApiKeyMonthlyLimitUseCase.js';
import type { ISetDefaultLlmProviderUseCase } from '#src/use-cases/user/ISetDefaultLlmProviderUseCase.js';
import type { ITestLlmApiKeyUseCase } from '#src/use-cases/user/ITestLlmApiKeyUseCase.js';
import type { IGetLlmUsageSummaryUseCase } from '#src/use-cases/user/IGetLlmUsageSummaryUseCase.js';
import type { IImportUserDataUseCase } from '#src/use-cases/user/IImportUserDataUseCase.js';
import type { IGetNotificationPreferencesUseCase } from '#src/use-cases/user/IGetNotificationPreferencesUseCase.js';
import type { IUpdateNotificationPreferencesUseCase } from '#src/use-cases/user/IUpdateNotificationPreferencesUseCase.js';
import type { IUpdateProfileUseCase } from '#src/use-cases/user/IUpdateProfileUseCase.js';
import type { IGetUserUseCase } from '#src/use-cases/user/IGetUserUseCase.js';
import type { IRequestAvatarUploadUrlUseCase } from '#src/use-cases/user/IRequestAvatarUploadUrlUseCase.js';
import type { IConfirmAvatarUseCase } from '#src/use-cases/user/IConfirmAvatarUseCase.js';
import type { IRemoveAvatarUseCase } from '#src/use-cases/user/IRemoveAvatarUseCase.js';
import type { IRequestAddBackupEmailUseCase } from '#src/use-cases/user/IRequestAddBackupEmailUseCase.js';
import type { IConfirmBackupEmailUseCase } from '#src/use-cases/user/IConfirmBackupEmailUseCase.js';
import type { IRemoveBackupEmailUseCase } from '#src/use-cases/user/IRemoveBackupEmailUseCase.js';
import { UserMapper } from '#src/interface-adapters/mappers/UserMapper.js';
import { LlmApiKeyMapper } from '#src/interface-adapters/mappers/LlmApiKeyMapper.js';
import { LlmUsageSummaryMapper } from '#src/interface-adapters/mappers/LlmUsageSummaryMapper.js';
import { makeStorageProvider } from '#src/__tests__/helpers/mocks/documents.js';
import { makeLlmApiKey } from '#src/__tests__/helpers/mocks/llm.js';
import { makeUser } from '#src/__tests__/helpers/mocks/user.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

const makeDeps = (overrides?: object) => ({
  requestEmailChangeUseCase: stub<IRequestEmailChangeUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  confirmEmailChangeUseCase: stub<IConfirmEmailChangeUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  updatePasswordUseCase: stub<IUpdatePasswordUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  deleteAccountUseCase: stub<IDeleteAccountUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  exportUserDataUseCase: stub<IExportUserDataUseCase>({ execute: vi.fn() }),
  generateTotpSecretUseCase: stub<IGenerateTotpSecretUseCase>({ execute: vi.fn() }),
  confirmTotpSetupUseCase: stub<IConfirmTotpSetupUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  disableTotpUseCase: stub<IDisableTotpUseCase>({ execute: vi.fn().mockResolvedValue(undefined) }),
  getTotpStatusUseCase: stub<IGetTotpStatusUseCase>({ execute: vi.fn() }),
  saveLlmApiKeyUseCase: stub<ISaveLlmApiKeyUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  listLlmApiKeysUseCase: stub<IListLlmApiKeysUseCase>({
    execute: vi.fn().mockResolvedValue([]),
  }),
  deleteLlmApiKeyUseCase: stub<IDeleteLlmApiKeyUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  setDefaultLlmProviderUseCase: stub<ISetDefaultLlmProviderUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  setLlmApiKeyMonthlyLimitUseCase: stub<ISetLlmApiKeyMonthlyLimitUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  testLlmApiKeyUseCase: stub<ITestLlmApiKeyUseCase>({
    execute: vi.fn().mockResolvedValue({ ok: true }),
  }),
  llmApiKeyMapper: new LlmApiKeyMapper(),
  getLlmUsageSummaryUseCase: stub<IGetLlmUsageSummaryUseCase>({
    execute: vi.fn().mockResolvedValue([]),
  }),
  llmUsageSummaryMapper: new LlmUsageSummaryMapper(),
  importUserDataUseCase: stub<IImportUserDataUseCase>({ execute: vi.fn() }),
  getNotificationPreferencesUseCase: stub<IGetNotificationPreferencesUseCase>({
    execute: vi.fn(),
  }),
  updateNotificationPreferencesUseCase: stub<IUpdateNotificationPreferencesUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  updateProfileUseCase: stub<IUpdateProfileUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  getUserUseCase: stub<IGetUserUseCase>({ execute: vi.fn() }),
  requestAvatarUploadUrlUseCase: stub<IRequestAvatarUploadUrlUseCase>({ execute: vi.fn() }),
  confirmAvatarUseCase: stub<IConfirmAvatarUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  removeAvatarUseCase: stub<IRemoveAvatarUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  requestAddBackupEmailUseCase: stub<IRequestAddBackupEmailUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  confirmBackupEmailUseCase: stub<IConfirmBackupEmailUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  removeBackupEmailUseCase: stub<IRemoveBackupEmailUseCase>({
    execute: vi.fn().mockResolvedValue(undefined),
  }),
  storageProvider: makeStorageProvider({
    getSignedUrl: vi.fn().mockResolvedValue('https://cdn.example.com/signed-url'),
  }),
  userMapper: new UserMapper(),
  ...overrides,
});

describe('UserResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('requestEmailChange', () => {
    it('delegates to requestEmailChangeUseCase with the correct arguments', async () => {
      const deps = makeDeps();
      const resolver = new UserResolver(deps);

      await resolver.requestEmailChange('user-1', 'oldPass', 'new@example.com', 1_700_000_000_000);

      expect(deps.requestEmailChangeUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        currentPassword: 'oldPass',
        newEmail: 'new@example.com',
        authTime: 1_700_000_000_000,
      });
    });

    it('propagates errors from the use case', async () => {
      const err = Object.assign(new Error('CONFLICT'), { code: 'CONFLICT' });
      const deps = makeDeps({
        requestEmailChangeUseCase: stub<IRequestEmailChangeUseCase>({
          execute: vi.fn().mockRejectedValue(err),
        }),
      });

      await expect(
        new UserResolver(deps).requestEmailChange('user-1', 'pass', 'taken@example.com', null),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    });
  });

  describe('confirmEmailChange', () => {
    it('delegates to confirmEmailChangeUseCase with the token and device info', async () => {
      const deps = makeDeps();
      const resolver = new UserResolver(deps);

      await resolver.confirmEmailChange('raw-token', {
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });

      expect(deps.confirmEmailChangeUseCase.execute).toHaveBeenCalledWith({
        token: 'raw-token',
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });
    });

    it('propagates errors from the use case', async () => {
      const err = Object.assign(new Error('UNAUTHORIZED'), { code: 'UNAUTHORIZED' });
      const deps = makeDeps({
        confirmEmailChangeUseCase: stub<IConfirmEmailChangeUseCase>({
          execute: vi.fn().mockRejectedValue(err),
        }),
      });

      await expect(
        new UserResolver(deps).confirmEmailChange('bad-token', {
          ipAddress: null,
          userAgent: null,
        }),
      ).rejects.toMatchObject({
        code: 'UNAUTHORIZED',
      });
    });
  });

  describe('updatePassword', () => {
    it('delegates to updatePasswordUseCase with the correct arguments', async () => {
      const deps = makeDeps();
      const resolver = new UserResolver(deps);

      await resolver.updatePassword('user-1', 'oldPass', 'newPass', 1_700_000_000_000, {
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });

      expect(deps.updatePasswordUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        currentPassword: 'oldPass',
        newPassword: 'newPass',
        authTime: 1_700_000_000_000,
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });
    });
  });

  describe('deleteAccount', () => {
    it('delegates to deleteAccountUseCase with the correct arguments', async () => {
      const deps = makeDeps();
      const resolver = new UserResolver(deps);

      await resolver.deleteAccount('user-1', 'secret', 1_700_000_000_000);

      expect(deps.deleteAccountUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        password: 'secret',
        authTime: 1_700_000_000_000,
      });
    });
  });

  describe('exportUserData', () => {
    it('delegates to exportUserDataUseCase and returns the result', async () => {
      const exportData = {
        exportedAt: '2024-01-01T00:00:00.000Z',
        user: { email: 'test@example.com', createdAt: '2024-01-01T00:00:00.000Z' },
        applications: [],
      };
      const deps = makeDeps({
        exportUserDataUseCase: stub<IExportUserDataUseCase>({
          execute: vi.fn().mockResolvedValue(exportData),
        }),
      });

      const result = await new UserResolver(deps).exportUserData('user-1');

      expect(deps.exportUserDataUseCase.execute).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(exportData);
    });
  });

  describe('beginTotpSetup', () => {
    it('delegates to generateTotpSecretUseCase and returns the result', async () => {
      const setup = {
        secret: 'ABCD1234',
        otpauthUrl: 'otpauth://totp/...',
        qrCodeDataUrl: 'data:image/png;base64,...',
      };
      const deps = makeDeps({
        generateTotpSecretUseCase: stub<IGenerateTotpSecretUseCase>({
          execute: vi.fn().mockResolvedValue(setup),
        }),
      });

      const result = await new UserResolver(deps).beginTotpSetup('user-1', 'secret123');

      expect(deps.generateTotpSecretUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        password: 'secret123',
      });
      expect(result).toEqual(setup);
    });
  });

  describe('confirmTotpSetup', () => {
    it('delegates to confirmTotpSetupUseCase and returns the result', async () => {
      const output = { backupCodes: ['aaaa1111bbbb2222'] };
      const deps = makeDeps({
        confirmTotpSetupUseCase: stub<IConfirmTotpSetupUseCase>({
          execute: vi.fn().mockResolvedValue(output),
        }),
      });

      const result = await new UserResolver(deps).confirmTotpSetup('user-1', '123456', {
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });

      expect(deps.confirmTotpSetupUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        code: '123456',
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });
      expect(result).toEqual(output);
    });

    it('propagates errors from the use case', async () => {
      const err = Object.assign(new Error('Invalid verification code'), { code: 'UNAUTHORIZED' });
      const deps = makeDeps({
        confirmTotpSetupUseCase: stub<IConfirmTotpSetupUseCase>({
          execute: vi.fn().mockRejectedValue(err),
        }),
      });

      await expect(
        new UserResolver(deps).confirmTotpSetup('user-1', 'bad-code', {
          ipAddress: null,
          userAgent: null,
        }),
      ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    });
  });

  describe('disableTotp', () => {
    it('delegates to disableTotpUseCase with the correct arguments', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).disableTotp('user-1', 'secret', {
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });

      expect(deps.disableTotpUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        password: 'secret',
        ipAddress: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
      });
    });
  });

  describe('getTotpStatus', () => {
    it('delegates to getTotpStatusUseCase and returns the result', async () => {
      const deps = makeDeps({
        getTotpStatusUseCase: stub<IGetTotpStatusUseCase>({
          execute: vi.fn().mockResolvedValue(true),
        }),
      });

      const result = await new UserResolver(deps).getTotpStatus('user-1');

      expect(deps.getTotpStatusUseCase.execute).toHaveBeenCalledWith('user-1');
      expect(result).toBe(true);
    });
  });

  describe('saveLlmApiKey', () => {
    it('delegates to saveLlmApiKeyUseCase with the correct arguments', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).saveLlmApiKey('user-1', 'openrouter', 'sk-123');

      expect(deps.saveLlmApiKeyUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'openrouter',
        apiKey: 'sk-123',
        model: undefined,
        baseUrl: undefined,
      });
    });

    it('passes through model and baseUrl when provided', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).saveLlmApiKey(
        'user-1',
        'custom',
        'sk-123',
        'my-model',
        'https://my-llm.example.com/v1/chat/completions',
      );

      expect(deps.saveLlmApiKeyUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'custom',
        apiKey: 'sk-123',
        model: 'my-model',
        baseUrl: 'https://my-llm.example.com/v1/chat/completions',
      });
    });
  });

  describe('listLlmApiKeys', () => {
    it('delegates to listLlmApiKeysUseCase and maps the results, omitting the encrypted key', async () => {
      const keys = [
        makeLlmApiKey({ provider: 'openai', model: 'gpt-4o', apiKey: 'encrypted:sk-abc' }),
      ];
      const deps = makeDeps({
        listLlmApiKeysUseCase: stub<IListLlmApiKeysUseCase>({
          execute: vi.fn().mockResolvedValue(keys),
        }),
      });

      const result = await new UserResolver(deps).listLlmApiKeys('user-1');

      expect(deps.listLlmApiKeysUseCase.execute).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([
        { provider: 'openai', model: 'gpt-4o', baseUrl: null, monthlyTokenLimit: null },
      ]);
    });
  });

  describe('getLlmUsageSummary', () => {
    it('delegates to getLlmUsageSummaryUseCase and maps dates to ISO strings', async () => {
      const lastUsedAt = new Date('2026-01-01T00:00:00.000Z');
      const deps = makeDeps({
        getLlmUsageSummaryUseCase: stub<IGetLlmUsageSummaryUseCase>({
          execute: vi.fn().mockResolvedValue([
            {
              provider: 'openai',
              requestCount: 3,
              promptTokens: 100,
              completionTokens: 40,
              cacheReadTokens: 60,
              cacheWriteTokens: 10,
              lastUsedAt,
            },
          ]),
        }),
      });

      const result = await new UserResolver(deps).getLlmUsageSummary('user-1');

      expect(deps.getLlmUsageSummaryUseCase.execute).toHaveBeenCalledWith('user-1');
      expect(result).toEqual([
        {
          provider: 'openai',
          requestCount: 3,
          promptTokens: 100,
          completionTokens: 40,
          cacheReadTokens: 60,
          cacheWriteTokens: 10,
          lastUsedAt: lastUsedAt.toISOString(),
        },
      ]);
    });
  });

  describe('deleteLlmApiKey', () => {
    it('delegates to deleteLlmApiKeyUseCase with the correct arguments', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).deleteLlmApiKey('user-1', 'openai');

      expect(deps.deleteLlmApiKeyUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'openai',
      });
    });
  });

  describe('setDefaultLlmProvider', () => {
    it('delegates to setDefaultLlmProviderUseCase with the correct arguments', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).setDefaultLlmProvider('user-1', 'openai');

      expect(deps.setDefaultLlmProviderUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'openai',
      });
    });
  });

  describe('setLlmApiKeyMonthlyLimit', () => {
    it('delegates to setLlmApiKeyMonthlyLimitUseCase with the correct arguments', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).setLlmApiKeyMonthlyLimit('user-1', 'openai', 2_000_000);

      expect(deps.setLlmApiKeyMonthlyLimitUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'openai',
        monthlyTokenLimit: 2_000_000,
      });
    });

    it('passes null through to clear the limit', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).setLlmApiKeyMonthlyLimit('user-1', 'openai', null);

      expect(deps.setLlmApiKeyMonthlyLimitUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'openai',
        monthlyTokenLimit: null,
      });
    });
  });

  describe('testLlmApiKey', () => {
    it('delegates to testLlmApiKeyUseCase with the correct arguments and returns its result', async () => {
      const deps = makeDeps({
        testLlmApiKeyUseCase: stub<ITestLlmApiKeyUseCase>({
          execute: vi.fn().mockResolvedValue({ ok: true }),
        }),
      });

      const result = await new UserResolver(deps).testLlmApiKey(
        'user-1',
        'openrouter',
        'sk-123',
        'gpt-4o',
        undefined,
      );

      expect(deps.testLlmApiKeyUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        provider: 'openrouter',
        apiKey: 'sk-123',
        model: 'gpt-4o',
        baseUrl: undefined,
      });
      expect(result).toEqual({ ok: true });
    });

    it('passes through a failure result unchanged', async () => {
      const deps = makeDeps({
        testLlmApiKeyUseCase: stub<ITestLlmApiKeyUseCase>({
          execute: vi.fn().mockResolvedValue({ ok: false, error: 'Invalid API key' }),
        }),
      });

      const result = await new UserResolver(deps).testLlmApiKey('user-1', 'openai');

      expect(result).toEqual({ ok: false, error: 'Invalid API key' });
    });
  });

  describe('importUserData', () => {
    it('delegates to importUserDataUseCase and returns the summary', async () => {
      const summary = {
        applicationsImported: 2,
        applicationsSkipped: 1,
        notesImported: 3,
        documentsSkipped: 1,
      };
      const deps = makeDeps({
        importUserDataUseCase: stub<IImportUserDataUseCase>({
          execute: vi.fn().mockResolvedValue(summary),
        }),
      });

      const result = await new UserResolver(deps).importUserData('user-1', '{"applications":[]}');

      expect(deps.importUserDataUseCase.execute).toHaveBeenCalledWith(
        'user-1',
        '{"applications":[]}',
      );
      expect(result).toEqual(summary);
    });

    it('propagates errors from the use case', async () => {
      const err = Object.assign(new Error('Import file is not valid JSON'), {
        code: 'VALIDATION',
      });
      const deps = makeDeps({
        importUserDataUseCase: stub<IImportUserDataUseCase>({
          execute: vi.fn().mockRejectedValue(err),
        }),
      });

      await expect(
        new UserResolver(deps).importUserData('user-1', 'not json'),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('getNotificationPreferences', () => {
    it('delegates to getNotificationPreferencesUseCase and returns the result', async () => {
      const prefs = { weeklyDigestEnabled: true, followUpRemindersEnabled: false };
      const deps = makeDeps({
        getNotificationPreferencesUseCase: stub<IGetNotificationPreferencesUseCase>({
          execute: vi.fn().mockResolvedValue(prefs),
        }),
      });

      const result = await new UserResolver(deps).getNotificationPreferences('user-1');

      expect(deps.getNotificationPreferencesUseCase.execute).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(prefs);
    });
  });

  describe('updateNotificationPreferences', () => {
    it('delegates to updateNotificationPreferencesUseCase with the correct arguments', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).updateNotificationPreferences('user-1', false, true);

      expect(deps.updateNotificationPreferencesUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        weeklyDigestEnabled: false,
        followUpRemindersEnabled: true,
      });
    });
  });

  describe('updateProfile', () => {
    it('delegates to updateProfileUseCase with the correct arguments', async () => {
      const deps = makeDeps();
      const resolver = new UserResolver(deps);

      await resolver.updateProfile('user-1', 'Jeff', 'UTC', 'Staff Engineer');

      expect(deps.updateProfileUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        name: 'Jeff',
        timezone: 'UTC',
        targetRole: 'Staff Engineer',
      });
    });

    it('passes useCrossApplicationContext through to the use case', async () => {
      const deps = makeDeps();
      const resolver = new UserResolver(deps);

      await resolver.updateProfile('user-1', undefined, undefined, undefined, undefined, true);

      expect(deps.updateProfileUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', useCrossApplicationContext: true }),
      );
    });

    it('propagates errors from the use case', async () => {
      const err = Object.assign(new Error('VALIDATION'), { code: 'VALIDATION' });
      const deps = makeDeps({
        updateProfileUseCase: stub<IUpdateProfileUseCase>({
          execute: vi.fn().mockRejectedValue(err),
        }),
      });

      await expect(
        new UserResolver(deps).updateProfile('user-1', undefined, 'Not/A_Zone', undefined),
      ).rejects.toMatchObject({ code: 'VALIDATION' });
    });
  });

  describe('getMe', () => {
    it('delegates to getUserUseCase and maps the result, with no avatarUrl when avatarKey is unset', async () => {
      const user = makeUser({ id: 'user-1', avatarKey: null });
      const deps = makeDeps({
        getUserUseCase: stub<IGetUserUseCase>({ execute: vi.fn().mockResolvedValue(user) }),
      });

      const result = await new UserResolver(deps).getMe('user-1');

      expect(deps.getUserUseCase.execute).toHaveBeenCalledWith('user-1');
      expect(result).toEqual(
        expect.objectContaining({ id: 'user-1', email: user.email, avatarUrl: null }),
      );
      expect(deps.storageProvider.getSignedUrl).not.toHaveBeenCalled();
    });

    it('resolves avatarKey to a signed avatarUrl when set', async () => {
      const user = makeUser({ id: 'user-1', avatarKey: 'users/user-1/avatar/key.png' });
      const deps = makeDeps({
        getUserUseCase: stub<IGetUserUseCase>({ execute: vi.fn().mockResolvedValue(user) }),
      });

      const result = await new UserResolver(deps).getMe('user-1');

      expect(deps.storageProvider.getSignedUrl).toHaveBeenCalledWith('users/user-1/avatar/key.png');
      expect(result?.avatarUrl).toBe('https://cdn.example.com/signed-url');
    });

    it('returns null when the use case returns null', async () => {
      const deps = makeDeps({
        getUserUseCase: stub<IGetUserUseCase>({ execute: vi.fn().mockResolvedValue(null) }),
      });

      const result = await new UserResolver(deps).getMe('missing');

      expect(result).toBeNull();
    });
  });

  describe('requestAvatarUploadUrl', () => {
    it('delegates to requestAvatarUploadUrlUseCase and returns the result', async () => {
      const payload = { uploadUrl: 'https://r2.example.com/upload', storageKey: 'key.png' };
      const deps = makeDeps({
        requestAvatarUploadUrlUseCase: stub<IRequestAvatarUploadUrlUseCase>({
          execute: vi.fn().mockResolvedValue(payload),
        }),
      });

      const result = await new UserResolver(deps).requestAvatarUploadUrl(
        'user-1',
        'me.png',
        'image/png',
      );

      expect(deps.requestAvatarUploadUrlUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        filename: 'me.png',
        mimeType: 'image/png',
      });
      expect(result).toEqual(payload);
    });
  });

  describe('confirmAvatar', () => {
    it('delegates to confirmAvatarUseCase and returns the resolved signed URL', async () => {
      const deps = makeDeps();

      const result = await new UserResolver(deps).confirmAvatar(
        'user-1',
        'users/user-1/avatar/key.png',
        'image/png',
        12345,
      );

      expect(deps.confirmAvatarUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        storageKey: 'users/user-1/avatar/key.png',
        mimeType: 'image/png',
        sizeBytes: 12345,
      });
      expect(deps.storageProvider.getSignedUrl).toHaveBeenCalledWith('users/user-1/avatar/key.png');
      expect(result).toBe('https://cdn.example.com/signed-url');
    });
  });

  describe('removeAvatar', () => {
    it('delegates to removeAvatarUseCase with the correct user id', async () => {
      const deps = makeDeps();

      await new UserResolver(deps).removeAvatar('user-1');

      expect(deps.removeAvatarUseCase.execute).toHaveBeenCalledWith('user-1');
    });
  });
});
