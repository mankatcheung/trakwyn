import { createHash } from 'node:crypto';
import type { AiFeature, AiModelTier } from '#src/use-cases/constants.js';

/** Hex characters of the user hash sent to the gateway: enough to tell users apart, too short to mistake for an id. */
const USER_HASH_LENGTH = 16;

export interface GatewayCallContext {
  userId: string;
  feature: AiFeature;
}

/**
 * The `cf-aig-metadata` value for one platform call (JEF-497): who (as a
 * hash), what for and on which tier, so gateway analytics can split spend
 * without Cloudflare ever holding an email or a Trakwyn user id. The gateway
 * takes at most five scalar entries and rejects keys starting `cf.`; this
 * sends three. The hash is stable, so Trakwyn can recompute it from a user id
 * to find who a row belongs to.
 */
export function buildGatewayMetadata(context: GatewayCallContext, tier: AiModelTier): string {
  const user = createHash('sha256').update(context.userId).digest('hex');
  return JSON.stringify({
    user: user.slice(0, USER_HASH_LENGTH),
    feature: context.feature,
    tier,
  });
}
