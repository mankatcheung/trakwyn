import { WORKERS_AI_BILLING } from '#src/infrastructure/config/constants.js';
import type { CostMismatchDirection } from '#src/infrastructure/observability/metrics.js';

/** What a call cost in micro-USD according to the neurons Workers AI reported (JEF-497). */
export function neuronsToMicros(neurons: number): number {
  return Math.round(neurons * WORKERS_AI_BILLING.MICRO_USD_PER_NEURON);
}

/**
 * Whether the price-table estimate and the neurons-based cost disagree enough
 * to mean a price changed: beyond the relative tolerance *and* by more than a
 * rounding amount, so a tiny call never trips it. `over` means the estimate is
 * higher than what Cloudflare billed. Pure.
 */
export function costMismatch(
  estimateMicros: number,
  neuronMicros: number,
): CostMismatchDirection | null {
  const gap = Math.abs(estimateMicros - neuronMicros);
  if (gap < WORKERS_AI_BILLING.MISMATCH_MIN_MICROS) return null;
  if (gap <= neuronMicros * WORKERS_AI_BILLING.MISMATCH_TOLERANCE) return null;
  return estimateMicros > neuronMicros ? 'over' : 'under';
}
