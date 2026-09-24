import { describe, it, expect, afterEach } from 'vitest';
import { metrics } from '@opentelemetry/api';
import {
  AggregationTemporality,
  InMemoryMetricExporter,
  MeterProvider,
  PeriodicExportingMetricReader,
} from '@opentelemetry/sdk-metrics';
import { METRICS, otelMetrics, noopMetrics } from '#src/infrastructure/observability/metrics.js';

describe('OtelMetrics', () => {
  afterEach(() => {
    metrics.disable();
  });

  it('emits counters to a registered meter provider with the expected names and attributes', async () => {
    const exporter = new InMemoryMetricExporter(AggregationTemporality.CUMULATIVE);
    const reader = new PeriodicExportingMetricReader({
      exporter,
      exportIntervalMillis: 60_000,
    });
    const provider = new MeterProvider({ readers: [reader] });
    metrics.setGlobalMeterProvider(provider);

    otelMetrics.recordCacheHit();
    otelMetrics.recordCacheHit();
    otelMetrics.recordCacheMiss();
    otelMetrics.recordFailOpen('session_blocklist', 'circuit_open');
    otelMetrics.recordCircuitTransition('cache', 'closed', 'open');

    await reader.forceFlush();

    const recorded = exporter
      .getMetrics()
      .flatMap((rm) => rm.scopeMetrics)
      .flatMap((sm) => sm.metrics);
    const byName = (name: string) => recorded.find((m) => m.descriptor.name === name);

    expect(byName(METRICS.CACHE_HITS)?.dataPoints[0]?.value).toBe(2);
    expect(byName(METRICS.CACHE_MISSES)?.dataPoints[0]?.value).toBe(1);

    const failOpen = byName(METRICS.REDIS_FAIL_OPEN)?.dataPoints[0];
    expect(failOpen?.value).toBe(1);
    expect(failOpen?.attributes).toEqual({
      component: 'session_blocklist',
      reason: 'circuit_open',
    });

    const transition = byName(METRICS.CIRCUIT_TRANSITIONS)?.dataPoints[0];
    expect(transition?.value).toBe(1);
    expect(transition?.attributes).toEqual({ component: 'cache', from: 'closed', to: 'open' });

    await provider.shutdown();
  });

  it('is safe to call when no meter provider is registered (local dev / tests)', () => {
    expect(() => {
      otelMetrics.recordCacheHit();
      otelMetrics.recordCacheMiss();
      otelMetrics.recordFailOpen('cache', 'error');
      otelMetrics.recordCircuitTransition('rate_limit', 'open', 'half-open');
    }).not.toThrow();
  });

  it('noopMetrics records nothing and never throws', () => {
    expect(() => {
      noopMetrics.recordCacheHit();
      noopMetrics.recordFailOpen('cache', 'error');
    }).not.toThrow();
  });
});
