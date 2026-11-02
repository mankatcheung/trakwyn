import type { IPushSubscriptionRepository } from '#src/use-cases/ports/IPushSubscriptionRepository.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import { assertCanRegisterDevice } from '#src/use-cases/push/assertCanRegisterDevice.js';

interface Deps {
  pushSubscriptionRepository: IPushSubscriptionRepository;
  generateId: () => string;
}

export interface RegisterExpoPushTokenInput {
  userId: string;
  token: string;
}

/**
 * Mobile counterpart of RegisterPushSubscriptionUseCase: an Expo push token
 * has no VAPID key material, so it's stored as a 'expo'-provider row with
 * the token itself as the endpoint (already unique per device/install,
 * satisfying the same uniqueness the web-push endpoint upsert relies on).
 */
export class RegisterExpoPushTokenUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RegisterExpoPushTokenInput): Promise<void> {
    await assertCanRegisterDevice(this.deps.pushSubscriptionRepository, {
      userId: input.userId,
      endpoint: input.token,
      provider: 'expo',
      limit: CONTENT_LIMITS.EXPO_PUSH_TOKENS_PER_USER,
      noun: 'mobile push tokens',
    });
    await this.deps.pushSubscriptionRepository.upsert({
      id: this.deps.generateId(),
      userId: input.userId,
      provider: 'expo',
      endpoint: input.token,
      p256dh: null,
      auth: null,
    });
  }
}
