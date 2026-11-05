import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerOpenError,
} from '#src/infrastructure/resilience/CircuitBreaker.js';

function makeBreaker(overrides: Partial<{ failureThreshold: number; cooldownMs: number }> = {}) {
  const onStateChange = vi.fn();
  const breaker = new CircuitBreaker({
    failureThreshold: 3,
    cooldownMs: 1000,
    ...overrides,
    onStateChange,
  });
  return { breaker, onStateChange };
}

describe('CircuitBreaker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts closed and returns the result of a successful call', async () => {
    const { breaker } = makeBreaker();
    const result = await breaker.execute(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });

  it('stays closed across repeated successes', async () => {
    const { breaker, onStateChange } = makeBreaker();
    for (let i = 0; i < 10; i++) await breaker.execute(() => Promise.resolve('ok'));
    expect(onStateChange).not.toHaveBeenCalled();
  });

  it('propagates the real error on each failure while still closed', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 3 });
    await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
  });

  it('opens after reaching the failure threshold and short-circuits without calling fn', async () => {
    const { breaker, onStateChange } = makeBreaker({ failureThreshold: 3 });
    const fn = vi.fn(() => Promise.reject(new Error('boom')));

    await expect(breaker.execute(fn)).rejects.toThrow('boom');
    await expect(breaker.execute(fn)).rejects.toThrow('boom');
    await expect(breaker.execute(fn)).rejects.toThrow('boom'); // 3rd failure trips it open
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onStateChange).toHaveBeenCalledWith('closed', 'open');

    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
    expect(fn).toHaveBeenCalledTimes(3); // not called a 4th time
  });

  it('stays open until the cooldown elapses', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    vi.advanceTimersByTime(999);
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );
  });

  it('allows one half-open trial through after the cooldown elapses, and closes on success', async () => {
    const { breaker, onStateChange } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    vi.advanceTimersByTime(1000);
    const result = await breaker.execute(() => Promise.resolve('recovered'));

    expect(result).toBe('recovered');
    expect(onStateChange).toHaveBeenCalledWith('open', 'half-open');
    expect(onStateChange).toHaveBeenCalledWith('half-open', 'closed');
  });

  it('reopens immediately if the half-open trial fails, without needing the full threshold again', async () => {
    const { breaker, onStateChange } = makeBreaker({ failureThreshold: 3, cooldownMs: 1000 });
    const fn = vi.fn(() => Promise.reject(new Error('boom')));

    await expect(breaker.execute(fn)).rejects.toThrow('boom');
    await expect(breaker.execute(fn)).rejects.toThrow('boom');
    await expect(breaker.execute(fn)).rejects.toThrow('boom'); // opens (3 failures)

    vi.advanceTimersByTime(1000);
    await expect(breaker.execute(fn)).rejects.toThrow('boom'); // half-open trial fails
    expect(onStateChange).toHaveBeenCalledWith('half-open', 'open');

    // Back in the open state immediately — no further calls until a fresh cooldown.
    await expect(breaker.execute(fn)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });

  it('resets the cooldown timer on a half-open trial failure', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
    await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');

    vi.advanceTimersByTime(1000);
    await expect(breaker.execute(() => Promise.reject(new Error('still down')))).rejects.toThrow(
      'still down',
    );

    // Only 500ms into the *new* cooldown — should still be open.
    vi.advanceTimersByTime(500);
    await expect(breaker.execute(() => Promise.resolve('ok'))).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );

    vi.advanceTimersByTime(500);
    await expect(breaker.execute(() => Promise.resolve('ok'))).resolves.toBe('ok');
  });

  it('resets the consecutive-failure count on any success', async () => {
    const { breaker } = makeBreaker({ failureThreshold: 3 });
    await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    await breaker.execute(() => Promise.resolve('ok')); // resets the streak

    const fn = vi.fn(() => Promise.reject(new Error('boom')));
    await expect(breaker.execute(fn)).rejects.toThrow('boom');
    await expect(breaker.execute(fn)).rejects.toThrow('boom');
    // Only 2 consecutive failures since the reset — still closed, fn still gets called.
    expect(fn).toHaveBeenCalledTimes(2);
  });

  describe('half-open trial (JEF-504)', () => {
    async function openedBreaker(opts: Parameters<typeof makeBreaker>[0] = {}) {
      const made = makeBreaker({ failureThreshold: 1, cooldownMs: 1000, ...opts });
      await expect(made.breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow(
        'boom',
      );
      vi.advanceTimersByTime(1000);
      return made;
    }

    it('lets exactly one caller through while the trial runs and refuses the rest', async () => {
      const { breaker } = await openedBreaker();
      let finishTrial!: (value: string) => void;
      const trial = vi.fn(
        () =>
          new Promise<string>((resolve) => {
            finishTrial = resolve;
          }),
      );
      const other = vi.fn(() => Promise.resolve('other'));

      const running = breaker.execute(trial);
      await expect(breaker.execute(other)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
      await expect(breaker.execute(other)).rejects.toBeInstanceOf(CircuitBreakerOpenError);
      expect(other).not.toHaveBeenCalled();

      finishTrial('recovered');
      await expect(running).resolves.toBe('recovered');
      await expect(breaker.execute(other)).resolves.toBe('other');
    });

    it('lets the next caller probe after a trial that failed and a new cooldown', async () => {
      const { breaker } = await openedBreaker();
      await expect(breaker.execute(() => Promise.reject(new Error('still down')))).rejects.toThrow(
        'still down',
      );

      vi.advanceTimersByTime(1000);
      await expect(breaker.execute(() => Promise.resolve('back'))).resolves.toBe('back');
    });
  });

  describe('isOpen', () => {
    it('is false while closed', () => {
      expect(makeBreaker().breaker.isOpen()).toBe(false);
    });

    it('is true during the cooldown and false once a trial may run', async () => {
      const { breaker } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
      await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow(
        'boom',
      );

      expect(breaker.isOpen()).toBe(true);
      vi.advanceTimersByTime(999);
      expect(breaker.isOpen()).toBe(true);
      vi.advanceTimersByTime(1);
      expect(breaker.isOpen()).toBe(false);
    });

    it('is true while the one trial is still running, so callers pick another route', async () => {
      const { breaker } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
      await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow(
        'boom',
      );
      vi.advanceTimersByTime(1000);

      let finishTrial!: () => void;
      const running = breaker.execute(
        () =>
          new Promise<void>((resolve) => {
            finishTrial = resolve;
          }),
      );
      expect(breaker.isOpen()).toBe(true);

      finishTrial();
      await running;
      expect(breaker.isOpen()).toBe(false);
    });
  });

  describe('classifyError', () => {
    const boom = new Error('boom');

    it('does not count an error classified as success, and resets the streak', async () => {
      const classifyError = vi.fn<(err: unknown) => 'failure' | 'success' | 'ignore'>();
      const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, classifyError });

      classifyError.mockReturnValueOnce('failure');
      await expect(breaker.execute(() => Promise.reject(boom))).rejects.toBe(boom);
      classifyError.mockReturnValueOnce('success'); // the dependency answered
      await expect(breaker.execute(() => Promise.reject(boom))).rejects.toBe(boom);
      classifyError.mockReturnValueOnce('failure');
      await expect(breaker.execute(() => Promise.reject(boom))).rejects.toBe(boom);

      expect(breaker.isOpen()).toBe(false); // 1 failure since the reset, threshold is 2
    });

    it('does not count an ignored error and leaves the streak as it was', async () => {
      const classifyError = vi.fn<(err: unknown) => 'failure' | 'success' | 'ignore'>();
      const breaker = new CircuitBreaker({ failureThreshold: 2, cooldownMs: 1000, classifyError });

      classifyError.mockReturnValueOnce('failure');
      await expect(breaker.execute(() => Promise.reject(boom))).rejects.toBe(boom);
      classifyError.mockReturnValueOnce('ignore');
      await expect(breaker.execute(() => Promise.reject(boom))).rejects.toBe(boom);
      expect(breaker.isOpen()).toBe(false);

      classifyError.mockReturnValueOnce('failure');
      await expect(breaker.execute(() => Promise.reject(boom))).rejects.toBe(boom);
      expect(breaker.isOpen()).toBe(true); // the ignored error did not reset the first failure
    });

    it('gives the trial slot back when the trial is ignored, staying half-open', async () => {
      const classifyError = vi.fn<(err: unknown) => 'failure' | 'success' | 'ignore'>();
      const { breaker, onStateChange } = (() => {
        const onStateChange = vi.fn();
        return {
          onStateChange,
          breaker: new CircuitBreaker({
            failureThreshold: 1,
            cooldownMs: 1000,
            classifyError,
            onStateChange,
          }),
        };
      })();
      classifyError.mockReturnValueOnce('failure');
      await expect(breaker.execute(() => Promise.reject(boom))).rejects.toBe(boom);
      vi.advanceTimersByTime(1000);

      classifyError.mockReturnValueOnce('ignore'); // the caller cancelled the trial
      await expect(breaker.execute(() => Promise.reject(boom))).rejects.toBe(boom);

      expect(breaker.isOpen()).toBe(false);
      await expect(breaker.execute(() => Promise.resolve('ok'))).resolves.toBe('ok');
      expect(onStateChange).toHaveBeenLastCalledWith('half-open', 'closed');
    });
  });

  describe('acquire', () => {
    it('settles once: a second settle on the same handle does nothing', () => {
      const { breaker } = makeBreaker({ failureThreshold: 2 });
      const attempt = breaker.acquire();

      attempt.fail(new Error('boom'));
      attempt.fail(new Error('boom'));

      expect(breaker.isOpen()).toBe(false); // one failure counted, not two
    });

    it('releases a half-open trial without a verdict', async () => {
      const { breaker } = makeBreaker({ failureThreshold: 1, cooldownMs: 1000 });
      await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow(
        'boom',
      );
      vi.advanceTimersByTime(1000);

      const trial = breaker.acquire();
      expect(breaker.isOpen()).toBe(true);
      trial.release();

      expect(breaker.isOpen()).toBe(false);
      expect(() => breaker.acquire()).not.toThrow();
    });

    it('throws CircuitBreakerOpenError while open', async () => {
      const { breaker } = makeBreaker({ failureThreshold: 1 });
      await expect(breaker.execute(() => Promise.reject(new Error('boom')))).rejects.toThrow(
        'boom',
      );

      expect(() => breaker.acquire()).toThrow(CircuitBreakerOpenError);
    });
  });
});
