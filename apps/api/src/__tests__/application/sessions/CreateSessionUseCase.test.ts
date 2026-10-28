import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CreateSessionUseCase } from '#src/use-cases/sessions/CreateSessionUseCase.js';
import { makeCreateNotificationUseCase } from '#src/__tests__/helpers/mocks/notifications.js';
import { makeSession, makeSessionRepository } from '#src/__tests__/helpers/mocks/sessions.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { SESSION } from '#src/use-cases/constants.js';
import type { IDeviceLabeler } from '#src/use-cases/ports/IDeviceLabeler.js';
import type { IIpLocationResolver } from '#src/use-cases/ports/IIpLocationResolver.js';
import type { IEmailService } from '#src/use-cases/ports/IEmailService.js';

const makeDeviceLabeler = (overrides?: Partial<IDeviceLabeler>): IDeviceLabeler => ({
  describe: vi.fn().mockReturnValue('Chrome on macOS'),
  ...overrides,
});

const makeIpLocationResolver = (overrides?: Partial<IIpLocationResolver>): IIpLocationResolver => ({
  lookup: vi.fn().mockResolvedValue('San Francisco, United States'),
  ...overrides,
});

const makeEmailService = (overrides?: Partial<IEmailService>): IEmailService => ({
  sendFollowUpReminder: vi.fn().mockResolvedValue(undefined),
  sendWeeklyDigest: vi.fn().mockResolvedValue(undefined),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendBackupEmailVerification: vi.fn().mockResolvedValue(undefined),
  sendNewDeviceLoginAlert: vi.fn().mockResolvedValue(undefined),
  sendStepUpCode: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionConfirmation: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionScheduled: vi.fn().mockResolvedValue(undefined),
  sendAccountDeletionCancelled: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const makeDeps = (overrides?: object) => ({
  sessionRepository: makeSessionRepository(),
  userRepository: makeUserRepository(),
  deviceLabeler: makeDeviceLabeler(),
  ipLocationResolver: makeIpLocationResolver(),
  emailService: makeEmailService(),
  createNotificationUseCase: makeCreateNotificationUseCase(),
  generateId: vi.fn().mockReturnValue('generated-id'),
  ...overrides,
});

describe('CreateSessionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a session with a generated id and device info', async () => {
    const sessionRepository = makeSessionRepository({
      create: vi.fn().mockResolvedValue(makeSession({ id: 'generated-id' })),
    });
    const generateId = vi.fn().mockReturnValue('generated-id');

    await new CreateSessionUseCase(makeDeps({ sessionRepository, generateId })).execute({
      userId: 'user-1',
      userAgent: 'Mozilla/5.0',
      ipAddress: '10.0.0.1',
    });

    expect(sessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'generated-id',
        userId: 'user-1',
        userAgent: 'Mozilla/5.0',
        ipAddress: '10.0.0.1',
      }),
    );
  });

  it('sets expiresAt roughly SESSION.TTL_MS in the future', async () => {
    const sessionRepository = makeSessionRepository({
      create: vi.fn().mockResolvedValue(makeSession()),
    });
    const generateId = vi.fn().mockReturnValue('generated-id');

    const before = Date.now();
    await new CreateSessionUseCase(makeDeps({ sessionRepository, generateId })).execute({
      userId: 'user-1',
      userAgent: null,
      ipAddress: null,
    });
    const after = Date.now();

    const createCall = vi.mocked(sessionRepository.create).mock.calls[0][0];
    const expiresAtMs = createCall.expiresAt.getTime();
    expect(expiresAtMs).toBeGreaterThanOrEqual(before + SESSION.TTL_MS - 1000);
    expect(expiresAtMs).toBeLessThanOrEqual(after + SESSION.TTL_MS + 1000);
  });

  it('generates an initial currentRefreshTokenId for the new session', async () => {
    const sessionRepository = makeSessionRepository({
      create: vi.fn().mockResolvedValue(makeSession()),
    });
    const generateId = vi
      .fn()
      .mockReturnValueOnce('generated-session-id')
      .mockReturnValueOnce('generated-refresh-token-id');

    await new CreateSessionUseCase(makeDeps({ sessionRepository, generateId })).execute({
      userId: 'user-1',
      userAgent: null,
      ipAddress: null,
    });

    expect(sessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'generated-session-id',
        currentRefreshTokenId: 'generated-refresh-token-id',
      }),
    );
  });

  it('returns the created session', async () => {
    const session = makeSession({ id: 'generated-id' });
    const sessionRepository = makeSessionRepository({ create: vi.fn().mockResolvedValue(session) });

    const result = await new CreateSessionUseCase(
      makeDeps({ sessionRepository, generateId: vi.fn().mockReturnValue('generated-id') }),
    ).execute({ userId: 'user-1', userAgent: null, ipAddress: null });

    expect(result).toEqual(session);
  });

  // detectNewDeviceAndAlert is awaited by execute(), so assertions after
  // `await execute()` can check the alert side effects directly.
  describe('new-device detection (awaited)', () => {
    it('persists a security_alert notification when signing in from an unrecognized device', async () => {
      const sessionRepository = makeSessionRepository({
        create: vi.fn().mockResolvedValue(makeSession()),
        findDistinctUserAgentsByUserId: vi.fn().mockResolvedValue(['Old Browser/1.0']),
      });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ email: 'user@example.com' })),
      });
      const createNotificationUseCase = makeCreateNotificationUseCase();

      await new CreateSessionUseCase(
        makeDeps({ sessionRepository, userRepository, createNotificationUseCase }),
      ).execute({ userId: 'user-1', userAgent: 'New Browser/2.0', ipAddress: '10.0.0.1' });

      expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: 'security_alert',
          title: 'New sign-in detected',
          url: '/settings/security#security-activity',
        }),
      );
    });

    it('still persists the notification when the alert email fails', async () => {
      const sessionRepository = makeSessionRepository({
        create: vi.fn().mockResolvedValue(makeSession()),
        findDistinctUserAgentsByUserId: vi.fn().mockResolvedValue(['Old Browser/1.0']),
      });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ email: 'user@example.com' })),
      });
      const createNotificationUseCase = makeCreateNotificationUseCase();
      const emailService = makeEmailService({
        // Brevo down, or WEB_APP_ORIGIN unset so the template refuses to build
        // a link it cannot trust — either way the email is the fragile half.
        sendNewDeviceLoginAlert: vi.fn().mockRejectedValue(new Error('email is down')),
      });

      await new CreateSessionUseCase(
        makeDeps({ sessionRepository, userRepository, createNotificationUseCase, emailService }),
      ).execute({ userId: 'user-1', userAgent: 'New Browser/2.0', ipAddress: '10.0.0.1' });

      // The two carry the same warning by different routes. Losing both would
      // leave a user with a suspicious sign-in and no warning at all.
      expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', type: 'security_alert' }),
      );
    });

    it('includes the location in the notification body when known', async () => {
      const sessionRepository = makeSessionRepository({
        create: vi.fn().mockResolvedValue(makeSession()),
        findDistinctUserAgentsByUserId: vi.fn().mockResolvedValue(['Old Browser/1.0']),
      });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ email: 'user@example.com' })),
      });
      const createNotificationUseCase = makeCreateNotificationUseCase();

      await new CreateSessionUseCase(
        makeDeps({ sessionRepository, userRepository, createNotificationUseCase }),
      ).execute({ userId: 'user-1', userAgent: 'New Browser/2.0', ipAddress: '10.0.0.1' });

      expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          body: 'Chrome on macOS signed in from San Francisco, United States',
        }),
      );
    });

    it('does not resolve until the new-device alert chain has settled (regression: was fire-and-forget)', async () => {
      let releaseAlert!: () => void;
      const alertGate = new Promise<void>((resolve) => (releaseAlert = resolve));
      const emailService = makeEmailService({
        sendNewDeviceLoginAlert: vi.fn().mockImplementation(async () => {
          await alertGate;
        }),
      });
      const sessionRepository = makeSessionRepository({
        create: vi.fn().mockResolvedValue(makeSession()),
        findDistinctUserAgentsByUserId: vi.fn().mockResolvedValue(['Old Browser/1.0']),
      });
      const userRepository = makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ email: 'user@example.com' })),
      });
      const createNotificationUseCase = makeCreateNotificationUseCase();

      let executed = false;
      const executePromise = new CreateSessionUseCase(
        makeDeps({ sessionRepository, userRepository, emailService, createNotificationUseCase }),
      )
        .execute({ userId: 'user-1', userAgent: 'New Browser/2.0', ipAddress: '10.0.0.1' })
        .then(() => {
          executed = true;
        });

      // Give the alert chain a tick: the email send should have been reached but
      // execute() must still be pending, waiting on it.
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(emailService.sendNewDeviceLoginAlert).toHaveBeenCalled();
      expect(executed).toBe(false);

      releaseAlert();
      await executePromise;
      expect(executed).toBe(true);
    });

    it('does not persist a notification for the very first session (no known devices yet)', async () => {
      const sessionRepository = makeSessionRepository({
        create: vi.fn().mockResolvedValue(makeSession()),
        findDistinctUserAgentsByUserId: vi.fn().mockResolvedValue([]),
      });
      const createNotificationUseCase = makeCreateNotificationUseCase();

      await new CreateSessionUseCase(
        makeDeps({ sessionRepository, createNotificationUseCase }),
      ).execute({ userId: 'user-1', userAgent: 'New Browser/2.0', ipAddress: '10.0.0.1' });

      expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    });

    it('does not persist a notification for an already-known device', async () => {
      const sessionRepository = makeSessionRepository({
        create: vi.fn().mockResolvedValue(makeSession()),
        findDistinctUserAgentsByUserId: vi.fn().mockResolvedValue(['Known Browser/1.0']),
      });
      const createNotificationUseCase = makeCreateNotificationUseCase();

      await new CreateSessionUseCase(
        makeDeps({ sessionRepository, createNotificationUseCase }),
      ).execute({ userId: 'user-1', userAgent: 'Known Browser/1.0', ipAddress: '10.0.0.1' });

      expect(createNotificationUseCase.execute).not.toHaveBeenCalled();
    });
  });
});
