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
import type { IToolCallObserver, ToolCallMeta } from '#src/use-cases/ports/IToolCallObserver.js';

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
  warn: vi.fn(),
  info: vi.fn(),
  ...overrides,
});

/** One call as a `makeToolCallObserver()` fake saw it: what it was told, and how it ended. */
export interface ObservedToolCall {
  meta: ToolCallMeta;
  /** Recorder methods called, in order: `succeeded`, `failed`, `invalid_params`, `refused`. */
  reports: string[];
  result?: unknown;
  error?: unknown;
  refusedUserId?: string;
  /** Set when the observed function threw rather than reporting. */
  threw?: unknown;
}

export type FakeToolCallObserver = IToolCallObserver & { calls: ObservedToolCall[] };

/** Runs every call straight through and records what the surface reported about it (JEF-365). */
export const makeToolCallObserver = (): FakeToolCallObserver => {
  const calls: ObservedToolCall[] = [];
  return {
    calls,
    async observe(meta, run) {
      const call: ObservedToolCall = { meta, reports: [] };
      calls.push(call);
      try {
        return await run({
          succeeded: (result) => {
            call.reports.push('succeeded');
            call.result = result;
          },
          failed: (error) => {
            call.reports.push('failed');
            call.error = error;
          },
          invalidParams: () => {
            call.reports.push('invalid_params');
          },
          refused: (userId) => {
            call.reports.push('refused');
            call.refusedUserId = userId;
          },
        });
      } catch (error) {
        call.threw = error;
        throw error;
      }
    },
  };
};
