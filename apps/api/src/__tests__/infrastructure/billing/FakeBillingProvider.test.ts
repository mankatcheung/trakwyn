import { describe, it, expect } from 'vitest';
import { FakeBillingProvider } from '#src/infrastructure/billing/FakeBillingProvider.js';

describe('FakeBillingProvider.revokeSubscription', () => {
  it('resolves and remembers which subscriptions were revoked, in order', async () => {
    const provider = new FakeBillingProvider();

    await expect(provider.revokeSubscription('sub-1')).resolves.toBeUndefined();
    await provider.revokeSubscription('sub-2');

    expect(provider.revokedSubscriptions).toEqual(['sub-1', 'sub-2']);
  });

  it('starts with nothing revoked', () => {
    expect(new FakeBillingProvider().revokedSubscriptions).toEqual([]);
  });
});
