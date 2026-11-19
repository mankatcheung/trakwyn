import { describe, it, expect } from 'vitest';
import { RegisterExpoPushTokenUseCase } from '#src/use-cases/push/RegisterExpoPushTokenUseCase.js';
import { makePushSubscriptionRepository } from '#src/__tests__/helpers/mocks/push.js';

describe('RegisterExpoPushTokenUseCase', () => {
  it('upserts an expo-provider subscription with the token as the endpoint', async () => {
    const pushSubscriptionRepository = makePushSubscriptionRepository();
    const useCase = new RegisterExpoPushTokenUseCase({
      pushSubscriptionRepository,
      generateId: () => 'generated-id',
    });

    await useCase.execute({ userId: 'user-1', token: 'ExponentPushToken[abc123]' });

    expect(pushSubscriptionRepository.upsert).toHaveBeenCalledWith({
      id: 'generated-id',
      userId: 'user-1',
      provider: 'expo',
      endpoint: 'ExponentPushToken[abc123]',
      p256dh: null,
      auth: null,
    });
  });
});
