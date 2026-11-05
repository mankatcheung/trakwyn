import { HOSTED_AI_CIRCUIT } from '#src/infrastructure/config/constants.js';
import {
  CircuitBreakingLLMProvider,
  classifyHostedFailure,
} from '#src/infrastructure/llm/CircuitBreakingLLMProvider.js';
import { otelMetrics, type IMetrics } from '#src/infrastructure/observability/metrics.js';
import { CircuitBreaker } from '#src/infrastructure/resilience/CircuitBreaker.js';
import type { ILogger } from '#src/use-cases/ports/ILogger.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';

interface Deps {
  logger: ILogger;
  metrics?: IMetrics;
  failureThreshold?: number;
  cooldownMs?: number;
}

/**
 * One health circuit per hosted model (JEF-504), created on first use.
 *
 * It exists as its own `SINGLETON` because `PlatformLLMProviderFactory` reads
 * its env on every call and builds fresh providers each time, so it cannot hold
 * state across requests. The state is process-local, like the Redis breaker:
 * each Cloud Run instance keeps its own view of whether a model is up.
 *
 * Not the daily spend breaker (`HostedAiSpendGuard`, JEF-449): that one refuses
 * calls to protect the budget, this one refuses them because the model is down.
 */
export class HostedAiCircuits {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly metrics: IMetrics;

  constructor(private readonly deps: Deps) {
    this.metrics = deps.metrics ?? otelMetrics;
  }

  /**
   * True when a call to `model` would be refused now. Counts as a short circuit
   * when it is, so a model skipped here shows up beside one refused mid-call.
   */
  refuses(model: string): boolean {
    const open = this.breakers.get(model)?.isOpen() ?? false;
    if (open) this.metrics.recordHostedAiCircuitShortCircuit(model);
    return open;
  }

  /** Puts `model`'s circuit around `provider`. */
  wrap(model: string, providerLabel: string, provider: ILLMProvider): ILLMProvider {
    return new CircuitBreakingLLMProvider(provider, this.breakerFor(model), providerLabel, () =>
      this.metrics.recordHostedAiCircuitShortCircuit(model),
    );
  }

  private breakerFor(model: string): CircuitBreaker {
    const existing = this.breakers.get(model);
    if (existing) return existing;
    const breaker = new CircuitBreaker({
      failureThreshold: this.deps.failureThreshold ?? HOSTED_AI_CIRCUIT.FAILURE_THRESHOLD,
      cooldownMs: this.deps.cooldownMs ?? HOSTED_AI_CIRCUIT.COOLDOWN_MS,
      classifyError: classifyHostedFailure,
      onStateChange: (from, to) => {
        this.metrics.recordHostedAiCircuitTransition(model, from, to);
        const fields = { event: 'llm.platform.circuit', model, from, to };
        if (to === 'open') this.deps.logger.warn('llm.platform.circuit', undefined, fields);
        else if (to === 'closed') this.deps.logger.info('llm.platform.circuit', fields);
      },
    });
    this.breakers.set(model, breaker);
    return breaker;
  }
}
