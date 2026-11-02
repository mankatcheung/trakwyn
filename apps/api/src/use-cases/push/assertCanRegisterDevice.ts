import type { IPushSubscriptionRepository } from '#src/use-cases/ports/IPushSubscriptionRepository.js';
import { assertUnderLimit } from '#src/use-cases/shared/assertUnderLimit.js';

interface DeviceRegistration {
  userId: string;
  endpoint: string;
  provider: 'web' | 'expo';
  limit: number;
  noun: string;
}

/**
 * Registration is an upsert on the endpoint, so a device that is already
 * registered must always be allowed to re-register (browsers and the app do so
 * on every launch). The cap only applies to an endpoint the user does not
 * have yet (JEF-339).
 */
export async function assertCanRegisterDevice(
  repository: IPushSubscriptionRepository,
  registration: DeviceRegistration,
): Promise<void> {
  const mine = await repository.findByUserId(registration.userId);
  if (mine.some((subscription) => subscription.endpoint === registration.endpoint)) return;

  const sameKind = mine.filter((subscription) => subscription.provider === registration.provider);
  assertUnderLimit(sameKind.length, registration.limit, registration.noun);
}
