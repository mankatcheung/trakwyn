import { HOSTED_AI } from '#src/use-cases/constants.js';
import { AiTemporarilyUnavailableError } from '#src/use-cases/errors/DomainError.js';
import type { IAiSpendGuard } from '#src/use-cases/ports/IAiSpendGuard.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { IAiSpendCounter } from '#src/infrastructure/cache/IAiSpendCounter.js';
import { ENV, HOSTED_AI_SPEND } from '#src/infrastructure/config/constants.js';
import type { BreakerOpenReason, IMetrics } from '#src/infrastructure/observability/metrics.js';

interface Deps {
  counter: IAiSpendCounter;
  logger: ILogger;
  metrics: IMetrics;
  now: () => Date;
  /** Read per call so a test, or a redeploy, can change it. Defaults to the environment. */
  budgetMicros?: () => number;
}

/** `HOSTED_AI_DAILY_BUDGET_USD` as micro-USD, or the default when unset or not a non-negative number. */
export function dailyBudgetMicros(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env[ENV.HOSTED_AI_DAILY_BUDGET_USD];
  if (raw === undefined || raw.trim() === '') return HOSTED_AI.DAILY_BUDGET_MICROS;
  const usd = Number(raw);
  return Number.isFinite(usd) && usd >= 0
    ? Math.round(usd * HOSTED_AI.MICROS_PER_USD)
    : HOSTED_AI.DAILY_BUDGET_MICROS;
}

/**
 * The daily hosted-AI spend breaker (JEF-449).
 *
 * Checked before each hosted call and incremented by its cost afterwards, so
 * the call that crosses the line is allowed and the next one is not: spend can
 * overshoot by what calls were in flight, never run on unchecked.
 *
 * **Fails closed.** A counter that cannot be read refuses the call, unlike the
 * rate limiter and session blocklist, which fail open: a spending limit that
 * stops applying when Redis is struggling is not a limit. Recording a cost
 * after the fact fails open instead — the call already happened, and the next
 * check refuses if the store is really down.
 */
export class HostedAiSpendGuard implements IAiSpendGuard {
  constructor(private readonly deps: Deps) {}

  async assertWithinBudget(): Promise<void> {
    const budget = (this.deps.budgetMicros ?? dailyBudgetMicros)();
    let spent: number;
    try {
      spent = await this.deps.counter.get(this.key());
    } catch (err) {
      this.open('store_error', { budgetMicros: budget }, err);
      throw new AiTemporarilyUnavailableError();
    }
    if (spent >= budget) {
      this.open('over_budget', { budgetMicros: budget, spentMicros: spent });
      throw new AiTemporarilyUnavailableError();
    }
  }

  async record(costMicros: number): Promise<void> {
    if (!(costMicros > 0)) return;
    try {
      await this.deps.counter.add(this.key(), costMicros);
    } catch (err) {
      this.deps.logger.error('[hosted-ai] failed to record spend — continuing', err);
    }
  }

  private key(): string {
    return `${HOSTED_AI_SPEND.KEY_PREFIX}${this.deps.now().toISOString().slice(0, 10)}`;
  }

  private open(reason: BreakerOpenReason, fields: Record<string, number>, err?: unknown): void {
    this.deps.metrics.recordHostedAiBreakerOpen(reason);
    this.deps.logger.warn(HOSTED_AI_SPEND.BREAKER_OPEN_EVENT, err, {
      event: HOSTED_AI_SPEND.BREAKER_OPEN_EVENT,
      reason,
      ...fields,
    });
  }
}
