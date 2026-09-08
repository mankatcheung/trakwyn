/**
 * Test doubles for the infrastructure domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IOutboundUrlPolicy } from '#src/use-cases/ports/IOutboundUrlPolicy.js';
import type { IRateLimiter } from '#src/use-cases/ports/IRateLimiter.js';
import type { ITransactionManager } from '#src/use-cases/ports/ITransactionManager.js';

export const makeRateLimiter = (overrides?: Partial<IRateLimiter>): IRateLimiter => ({
  consume: vi.fn().mockResolvedValue(true),
  ...overrides,
});

/** Allows everything unless overridden — the "no" cases are what tests assert on. */
export const makeOutboundUrlPolicy = (
  overrides?: Partial<IOutboundUrlPolicy>,
): IOutboundUrlPolicy => ({
  assertAllowed: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

// generateSecret/getOtpauthUrl/verifyCode delegate to the real TOTP algorithm so
// tests can generate and verify genuinely valid codes; encryptSecret/decryptSecret
// use a simple reversible scheme so tests don't need TOTP_ENCRYPTION_KEY configured.

export const makeTransactionManager = (
  overrides?: Partial<ITransactionManager>,
): ITransactionManager => ({
  run: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()),
  ...overrides,
});

export const makeLogger = (overrides?: Partial<ILogger>): ILogger => ({
  error: vi.fn(),
  ...overrides,
});
