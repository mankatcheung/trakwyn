import { describe, it, expect, vi } from 'vitest';
import { SendPushNotificationsUseCase } from '#src/use-cases/push/SendPushNotificationsUseCase.js';
import type { IWebPushService } from '#src/use-cases/ports/IWebPushService.js';
import type { IExpoPushService } from '#src/use-cases/ports/IExpoPushService.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeCreateNotificationUseCase } from '#src/__tests__/helpers/mocks/notifications.js';
import {
  makePushSubscription,
  makePushSubscriptionRepository,
} from '#src/__tests__/helpers/mocks/push.js';
import { makeUser, makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

const makeWebPushService = (overrides?: Partial<IWebPushService>): IWebPushService =>
  stub<IWebPushService>({
    send: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

const makeExpoPushService = (overrides?: Partial<IExpoPushService>): IExpoPushService =>
  stub<IExpoPushService>({
    send: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  });

const makeDeps = (overrides?: object) => ({
  applicationRepository: makeApplicationRepository(),
  interviewRoundRepository: makeInterviewRoundRepository(),
  userRepository: makeUserRepository(),
  pushSubscriptionRepository: makePushSubscriptionRepository(),
  logger: makeLogger(),
  webPushService: makeWebPushService(),
  expoPushService: makeExpoPushService(),
  createNotificationUseCase: makeCreateNotificationUseCase(),
  ...overrides,
});

describe('SendPushNotificationsUseCase', () => {
  it('persists an interview-reminder notification, even when the user has no push subscription', async () => {
    const round = makeInterviewRound({
      id: 'round-1',
      applicationId: 'app-1',
      type: 'phone',
      scheduledAt: new Date('2024-06-01T10:00:00.000Z'),
    });
    const app = makeApplication({ id: 'app-1', userId: 'user-1', company: 'Acme', role: 'Eng' });
    const createNotificationUseCase = makeCreateNotificationUseCase();
    const deps = makeDeps({
      interviewRoundRepository: makeInterviewRoundRepository({
        findUpcomingWithinWindow: vi.fn().mockResolvedValue([round]),
      }),
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(app),
        findDueForReminder: vi.fn().mockResolvedValue([]),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ pushNotificationsEnabled: false })),
      }),
      createNotificationUseCase,
    });

    await new SendPushNotificationsUseCase(deps).execute();

    expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        type: 'interview_reminder',
        title: 'Upcoming interview: Acme',
        url: '/applications/app-1?section=interviews',
      }),
    );
  });

  it('persists a follow-up-reminder notification', async () => {
    const app = makeApplication({ id: 'app-2', userId: 'user-2', company: 'Globex', role: 'PM' });
    const createNotificationUseCase = makeCreateNotificationUseCase();
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        findDueForReminder: vi.fn().mockResolvedValue([app]),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ pushNotificationsEnabled: false })),
      }),
      createNotificationUseCase,
    });

    await new SendPushNotificationsUseCase(deps).execute();

    expect(createNotificationUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-2',
        type: 'follow_up_reminder',
        title: 'Follow up: Globex',
        url: '/applications/app-2?section=contacts',
      }),
    );
  });

  it('sends a push to every subscription when the user has push enabled', async () => {
    const app = makeApplication({ id: 'app-2', userId: 'user-2' });
    const sub1 = makePushSubscription({ id: 'sub-1', endpoint: 'https://push/1' });
    const sub2 = makePushSubscription({ id: 'sub-2', endpoint: 'https://push/2' });
    const webPushService = makeWebPushService();
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        findDueForReminder: vi.fn().mockResolvedValue([app]),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ pushNotificationsEnabled: true })),
      }),
      pushSubscriptionRepository: makePushSubscriptionRepository({
        findByUserId: vi.fn().mockResolvedValue([sub1, sub2]),
      }),
      webPushService,
    });

    const summary = await new SendPushNotificationsUseCase(deps).execute();

    expect(webPushService.send).toHaveBeenCalledTimes(2);
    // One count per subscription, which is what was actually delivered — the
    // route reports it as the run's `processed` (JEF-352).
    expect(summary).toEqual({ delivered: 2, failed: 0 });
  });

  it('skips sending when the user has push disabled', async () => {
    const app = makeApplication({ id: 'app-2', userId: 'user-2' });
    const webPushService = makeWebPushService();
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        findDueForReminder: vi.fn().mockResolvedValue([app]),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ pushNotificationsEnabled: false })),
      }),
      webPushService,
    });

    await new SendPushNotificationsUseCase(deps).execute();

    expect(webPushService.send).not.toHaveBeenCalled();
  });

  it('skips sending when the user has no subscriptions', async () => {
    const app = makeApplication({ id: 'app-2', userId: 'user-2' });
    const webPushService = makeWebPushService();
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        findDueForReminder: vi.fn().mockResolvedValue([app]),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ pushNotificationsEnabled: true })),
      }),
      pushSubscriptionRepository: makePushSubscriptionRepository({
        findByUserId: vi.fn().mockResolvedValue([]),
      }),
      webPushService,
    });

    await new SendPushNotificationsUseCase(deps).execute();

    expect(webPushService.send).not.toHaveBeenCalled();
  });

  it('marks the interview round as notified after processing', async () => {
    const round = makeInterviewRound({
      id: 'round-1',
      applicationId: 'app-1',
      scheduledAt: new Date('2024-06-01T10:00:00.000Z'),
    });
    const interviewRoundRepository = makeInterviewRoundRepository({
      findUpcomingWithinWindow: vi.fn().mockResolvedValue([round]),
    });
    const deps = makeDeps({
      interviewRoundRepository,
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ id: 'app-1', userId: 'user-1' })),
        findDueForReminder: vi.fn().mockResolvedValue([]),
      }),
    });

    await new SendPushNotificationsUseCase(deps).execute();

    expect(interviewRoundRepository.updatePushNotificationSentAt).toHaveBeenCalledWith(
      'round-1',
      expect.any(Date),
    );
  });

  it('removes an expired (410) subscription without failing the whole batch', async () => {
    const app = makeApplication({ id: 'app-2', userId: 'user-2' });
    const sub = makePushSubscription({ endpoint: 'https://push/expired' });
    const pushSubscriptionRepository = makePushSubscriptionRepository({
      findByUserId: vi.fn().mockResolvedValue([sub]),
    });
    const webPushService = makeWebPushService({
      send: vi.fn().mockRejectedValue({ statusCode: 410 }),
    });
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        findDueForReminder: vi.fn().mockResolvedValue([app]),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ pushNotificationsEnabled: true })),
      }),
      pushSubscriptionRepository,
      webPushService,
    });

    await expect(new SendPushNotificationsUseCase(deps).execute()).resolves.toEqual({
      delivered: 0,
      failed: 1,
    });

    expect(pushSubscriptionRepository.deleteByEndpoint).toHaveBeenCalledWith(
      'https://push/expired',
    );
  });

  it('delivers to an expo-provider subscription via expoPushService instead of webPushService', async () => {
    const app = makeApplication({ id: 'app-2', userId: 'user-2' });
    const sub = makePushSubscription({
      provider: 'expo',
      endpoint: 'ExponentPushToken[abc123]',
      p256dh: null,
      auth: null,
    });
    const pushSubscriptionRepository = makePushSubscriptionRepository({
      findByUserId: vi.fn().mockResolvedValue([sub]),
    });
    const webPushService = makeWebPushService();
    const expoPushService = makeExpoPushService();
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        findDueForReminder: vi.fn().mockResolvedValue([app]),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ pushNotificationsEnabled: true })),
      }),
      pushSubscriptionRepository,
      webPushService,
      expoPushService,
    });

    await new SendPushNotificationsUseCase(deps).execute();

    expect(expoPushService.send).toHaveBeenCalledWith(
      'ExponentPushToken[abc123]',
      expect.objectContaining({ title: expect.any(String) }),
    );
    expect(webPushService.send).not.toHaveBeenCalled();
  });

  it('removes an expo subscription whose delivery failed with DeviceNotRegistered', async () => {
    const app = makeApplication({ id: 'app-2', userId: 'user-2' });
    const sub = makePushSubscription({
      provider: 'expo',
      endpoint: 'ExponentPushToken[dead]',
      p256dh: null,
      auth: null,
    });
    const pushSubscriptionRepository = makePushSubscriptionRepository({
      findByUserId: vi.fn().mockResolvedValue([sub]),
    });
    const expoPushService = makeExpoPushService({
      send: vi.fn().mockRejectedValue(
        Object.assign(new Error('dead token'), {
          code: 'DeviceNotRegistered',
        }),
      ),
    });
    const deps = makeDeps({
      applicationRepository: makeApplicationRepository({
        findDueForReminder: vi.fn().mockResolvedValue([app]),
      }),
      userRepository: makeUserRepository({
        findById: vi.fn().mockResolvedValue(makeUser({ pushNotificationsEnabled: true })),
      }),
      pushSubscriptionRepository,
      expoPushService,
    });

    await expect(new SendPushNotificationsUseCase(deps).execute()).resolves.toEqual({
      delivered: 0,
      failed: 1,
    });

    expect(pushSubscriptionRepository.deleteByEndpoint).toHaveBeenCalledWith(
      'ExponentPushToken[dead]',
    );
  });
});
