import { CIRCUIT_BREAKER } from '#src/infrastructure/config/constants.js';

export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * How a failed call counts toward the circuit:
 * - `failure`: the dependency looks unhealthy (timeout, 5xx, unreachable).
 * - `success`: the call failed but the dependency answered (a 4xx), so it is up.
 * - `ignore`: says nothing about health (the caller cancelled). A half-open
 *   trial that ends this way gives its slot back and the circuit stays half-open.
 */
export type FailureClass = 'failure' | 'success' | 'ignore';

/** One call's claim on the breaker, from `acquire()`. Settle it exactly once. */
export interface CircuitAttempt {
  succeed(): void;
  fail(err: unknown): void;
  /** The call ended without saying anything about health (the caller walked away). */
  release(): void;
}

/** Thrown by `execute()` when the breaker is open — the wrapped call never ran. */
export class CircuitBreakerOpenError extends Error {
  constructor() {
    super('Circuit breaker is open');
    this.name = 'CircuitBreakerOpenError';
  }
}

interface Deps {
  failureThreshold?: number;
  cooldownMs?: number;
  /** Test/observability hook — fires on every state transition. */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
  /** Decides how a thrown error counts. Defaults to `failure` for every error. */
  classifyError?: (err: unknown) => FailureClass;
}

/**
 * Generic closed → open → half-open circuit breaker. Not Redis-specific —
 * wraps any async operation, failing fast (without calling the operation at
 * all) once it's decided the dependency is unhealthy, rather than making
 * every caller wait out a slow timeout individually.
 *
 * Once the cooldown has passed, exactly one trial call is let through; every
 * other caller is refused until that trial settles, so a recovering dependency
 * is not hit by everything that queued up behind the open circuit.
 *
 * State is intentionally process-local: each instance tracks its own view of
 * "is my connection to the dependency healthy," which is the standard
 * approach for this pattern (Hystrix, resilience4j, Polly all do the same).
 * There's also no way to coordinate this via the dependency itself — using
 * Redis to track "is Redis down" would be circular.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;
  private trialInFlight = false;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;
  private readonly classifyError: (err: unknown) => FailureClass;

  constructor({
    failureThreshold = CIRCUIT_BREAKER.FAILURE_THRESHOLD,
    cooldownMs = CIRCUIT_BREAKER.COOLDOWN_MS,
    onStateChange,
    classifyError = () => 'failure',
  }: Deps = {}) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.onStateChange = onStateChange;
    this.classifyError = classifyError;
  }

  /**
   * True when `execute()` would refuse a call right now: cooling down, or the
   * one half-open trial is already running. Lets a caller pick another route
   * without throwing; it does not reserve the trial.
   */
  isOpen(): boolean {
    if (this.state === 'open') return Date.now() - this.openedAt < this.cooldownMs;
    return this.state === 'half-open' && this.trialInFlight;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const attempt = this.acquire();
    try {
      const result = await fn();
      attempt.succeed();
      return result;
    } catch (err) {
      attempt.fail(err);
      throw err;
    }
  }

  /**
   * Takes one call's place before it starts, for work that is not a single
   * promise (a stream). Throws `CircuitBreakerOpenError` when `execute()` would.
   * The caller settles the handle exactly once with `succeed()` or `fail(err)`,
   * or `release()` when the call ended without saying anything about health;
   * later calls on a settled handle do nothing.
   */
  acquire(): CircuitAttempt {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt < this.cooldownMs) {
        throw new CircuitBreakerOpenError();
      }
      this.transition('half-open');
    }
    if (this.state === 'half-open') {
      if (this.trialInFlight) throw new CircuitBreakerOpenError();
      this.trialInFlight = true;
    }

    let settled = false;
    const once = (settle: () => void) => () => {
      if (settled) return;
      settled = true;
      settle();
    };
    return {
      succeed: once(() => this.onSuccess()),
      release: once(() => {
        this.trialInFlight = false;
      }),
      fail: (err: unknown) => {
        if (settled) return;
        settled = true;
        const outcome = this.classifyError(err);
        if (outcome === 'failure') this.onFailure();
        else if (outcome === 'success') this.onSuccess();
        else this.trialInFlight = false;
      },
    };
  }

  private onSuccess(): void {
    this.trialInFlight = false;
    this.consecutiveFailures = 0;
    if (this.state !== 'closed') this.transition('closed');
  }

  private onFailure(): void {
    this.trialInFlight = false;
    this.consecutiveFailures++;
    // A half-open trial gets exactly one chance — any failure reopens
    // immediately rather than counting toward the full threshold again.
    if (this.state === 'half-open' || this.consecutiveFailures >= this.failureThreshold) {
      this.openedAt = Date.now();
      this.transition('open');
    }
  }

  private transition(to: CircuitState): void {
    if (to === this.state) return;
    const from = this.state;
    this.state = to;
    this.onStateChange?.(from, to);
  }
}
