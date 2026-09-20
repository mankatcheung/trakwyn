import type {
  FailOpenReason,
  IMetrics,
  MetricComponent,
} from '#src/infrastructure/observability/metrics.js';

export interface FailOpenEvent {
  component: MetricComponent;
  reason: FailOpenReason;
}

export interface CircuitTransitionEvent {
  component: MetricComponent;
  from: string;
  to: string;
}

export interface FakeMetrics extends IMetrics {
  hits: number;
  misses: number;
  failOpens: FailOpenEvent[];
  circuitTransitions: CircuitTransitionEvent[];
  databasePoolErrors: number;
}

/**
 * Recording IMetrics stand-in — lets tests assert on what was measured
 * without standing up an OTel SDK and an in-memory metric reader.
 */
export function makeFakeMetrics(): FakeMetrics {
  const fake: FakeMetrics = {
    hits: 0,
    misses: 0,
    failOpens: [],
    circuitTransitions: [],
    databasePoolErrors: 0,
    recordCacheHit: () => {
      fake.hits++;
    },
    recordCacheMiss: () => {
      fake.misses++;
    },
    recordFailOpen: (component, reason) => {
      fake.failOpens.push({ component, reason });
    },
    recordCircuitTransition: (component, from, to) => {
      fake.circuitTransitions.push({ component, from, to });
    },
    recordDatabasePoolError: () => {
      fake.databasePoolErrors++;
    },
  };
  return fake;
}
