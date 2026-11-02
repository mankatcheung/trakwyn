import type { IPushSubscriptionRepository } from '#src/use-cases/ports/IPushSubscriptionRepository.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import { assertCanRegisterDevice } from '#src/use-cases/push/assertCanRegisterDevice.js';

interface Deps {
  pushSubscriptionRepository: IPushSubscriptionRepository;
  generateId: () => string;
}

export interface RegisterPushSubscriptionInput {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export class RegisterPushSubscriptionUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RegisterPushSubscriptionInput): Promise<void> {
    await assertCanRegisterDevice(this.deps.pushSubscriptionRepository, {
      userId: input.userId,
      endpoint: input.endpoint,
      provider: 'web',
      limit: CONTENT_LIMITS.PUSH_SUBSCRIPTIONS_PER_USER,
      noun: 'browser push subscriptions',
    });
    await this.deps.pushSubscriptionRepository.upsert({
      id: this.deps.generateId(),
      userId: input.userId,
      provider: 'web',
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
    });
  }
}
