import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HostedAiCircuits } from '#src/infrastructure/llm/HostedAiCircuits.js';
import { HOSTED_AI_CIRCUIT } from '#src/infrastructure/config/constants.js';
import { LlmProviderError } from '#src/use-cases/errors/DomainError.js';
import type { ILLMProvider } from '#src/use-cases/ports/ILLMProvider.js';
import { makeLogger } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeFakeMetrics } from '#src/__tests__/helpers/fakeMetrics.js';

const MODEL = '@cf/test/model-a';
const down = () => new LlmProviderError('unavailable', { status: 503 });

function failing(): ILLMProvider {
  return { complete: vi.fn().mockRejectedValue(down()), completeWithToolsStream: vi.fn() };
}

function build(overrides: { failureThreshold?: number; cooldownMs?: number } = {}) {
  const logger = makeLogger();
  const metrics = makeFakeMetrics();
  const circuits = new HostedAiCircuits({ logger, metrics, ...overrides });
  return { circuits, logger, metrics };
}

describe('HostedAiCircuits', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the HOSTED_AI_CIRCUIT policy by default: three failures open it', async () => {
    const { circuits } = build();
    const provider = circuits.wrap(MODEL, 'workersai', failing());

    for (let i = 0; i < HOSTED_AI_CIRCUIT.FAILURE_THRESHOLD - 1; i++) {
      await provider.complete([]).catch(() => undefined);
    }
    expect(circuits.refuses(MODEL)).toBe(false);

    await provider.complete([]).catch(() => undefined);
    expect(circuits.refuses(MODEL)).toBe(true);
  });

  it('keeps a separate circuit per model', async () => {
    const { circuits } = build({ failureThreshold: 1 });
    await circuits
      .wrap(MODEL, 'workersai', failing())
      .complete([])
      .catch(() => undefined);

    expect(circuits.refuses(MODEL)).toBe(true);
    expect(circuits.refuses('@cf/test/model-b')).toBe(false);
  });

  it('shares one circuit between providers wrapped for the same model', async () => {
    const { circuits } = build({ failureThreshold: 1 });
    await circuits
      .wrap(MODEL, 'workersai', failing())
      .complete([])
      .catch(() => undefined);

    const other = failing();
    await expect(circuits.wrap(MODEL, 'workersai', other).complete([])).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(other.complete).not.toHaveBeenCalled();
  });

  it('records a transition metric and warns when a circuit opens', async () => {
    const { circuits, logger, metrics } = build({ failureThreshold: 1 });

    await circuits
      .wrap(MODEL, 'workersai', failing())
      .complete([])
      .catch(() => undefined);

    expect(metrics.hostedCircuitTransitions).toEqual([
      { model: MODEL, from: 'closed', to: 'open' },
    ]);
    expect(logger.warn).toHaveBeenCalledWith('llm.platform.circuit', undefined, {
      event: 'llm.platform.circuit',
      model: MODEL,
      from: 'closed',
      to: 'open',
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  it('logs at info and records the transitions when it recovers', async () => {
    const { circuits, logger, metrics } = build({ failureThreshold: 1, cooldownMs: 1000 });
    const healthy: ILLMProvider = {
      complete: vi
        .fn()
        .mockResolvedValue({ content: 'ok', usage: { promptTokens: 1, completionTokens: 1 } }),
      completeWithToolsStream: vi.fn(),
    };
    await circuits
      .wrap(MODEL, 'workersai', failing())
      .complete([])
      .catch(() => undefined);

    vi.advanceTimersByTime(1000);
    await circuits.wrap(MODEL, 'workersai', healthy).complete([]);

    expect(metrics.hostedCircuitTransitions.map((t) => `${t.from}>${t.to}`)).toEqual([
      'closed>open',
      'open>half-open',
      'half-open>closed',
    ]);
    expect(logger.info).toHaveBeenCalledWith('llm.platform.circuit', {
      event: 'llm.platform.circuit',
      model: MODEL,
      from: 'half-open',
      to: 'closed',
    });
    expect(logger.warn).toHaveBeenCalledTimes(1); // the half-open step is not logged
  });

  it('counts a short circuit for a refused call and for a skipped model', async () => {
    const { circuits, metrics } = build({ failureThreshold: 1 });
    const provider = circuits.wrap(MODEL, 'workersai', failing());
    await provider.complete([]).catch(() => undefined);

    await provider.complete([]).catch(() => undefined); // refused mid-call
    circuits.refuses(MODEL); // skipped when the legs are built

    expect(metrics.hostedCircuitShortCircuits).toEqual([MODEL, MODEL]);
  });

  it('does not count a short circuit for a model that is up', () => {
    const { circuits, metrics } = build();

    expect(circuits.refuses(MODEL)).toBe(false);
    expect(metrics.hostedCircuitShortCircuits).toEqual([]);
  });
});
