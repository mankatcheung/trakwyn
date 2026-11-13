import { describe, expect, it } from 'vitest';
import { pseudonymousUserId } from '#src/infrastructure/privacy/pseudonymousUserId.js';
import { buildGatewayMetadata } from '#src/infrastructure/llm/gatewayMetadata.js';
import { AI_FEATURE } from '#src/use-cases/constants.js';

describe('pseudonymousUserId', () => {
  it('is 16 hex characters, stable and not the id', () => {
    const hash = pseudonymousUserId('user-1');
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    expect(pseudonymousUserId('user-1')).toBe(hash);
    expect(pseudonymousUserId('user-2')).not.toBe(hash);
  });

  it('is the same value the gateway metadata carries', () => {
    const metadata = JSON.parse(
      buildGatewayMetadata({ userId: 'user-1', feature: AI_FEATURE.CHAT }, 'lite'),
    );
    expect(metadata.user).toBe(pseudonymousUserId('user-1'));
  });
});
