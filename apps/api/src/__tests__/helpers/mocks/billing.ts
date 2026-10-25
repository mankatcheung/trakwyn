/** Test doubles for paying for Pro (JEF-426). */

import { vi } from 'vitest';
import type { IBillingEventRepository } from '#src/use-cases/ports/IBillingEventRepository.js';
import type { IBillingProvider } from '#src/use-cases/ports/IBillingProvider.js';

export const makeBillingProvider = (overrides?: Partial<IBillingProvider>): IBillingProvider => ({
  createCheckoutSession: vi.fn().mockResolvedValue({ url: 'https://pay.example/checkout' }),
  createPortalSession: vi.fn().mockResolvedValue({ url: 'https://pay.example/portal' }),
  revokeSubscription: vi.fn().mockResolvedValue(undefined),
  parseWebhook: vi.fn(),
  ...overrides,
});

export const makeBillingEventRepository = (
  overrides?: Partial<IBillingEventRepository>,
): IBillingEventRepository => ({
  tryRecord: vi.fn().mockResolvedValue(true),
  ...overrides,
});
