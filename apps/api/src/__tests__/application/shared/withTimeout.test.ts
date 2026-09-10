import { describe, it, expect, vi } from 'vitest';
import { withTimeout } from '#src/use-cases/shared/withTimeout.js';

describe('withTimeout', () => {
  it('resolves with the promise when it settles in time', async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, () => new Error('late'))).resolves.toBe(42);
  });

  it('rejects with the caller-built error once the deadline passes', async () => {
    vi.useFakeTimers();
    try {
      const pending = withTimeout(new Promise<never>(() => {}), 500, () => new Error('late'));
      const settled = pending.catch((e: Error) => e);
      await vi.advanceTimersByTimeAsync(501);
      expect(await settled).toMatchObject({ message: 'late' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears its timer when the promise wins', async () => {
    vi.useFakeTimers();
    try {
      await withTimeout(Promise.resolve('ok'), 500, () => new Error('late'));
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
