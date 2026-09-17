import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createShutdownHandler } from '#src/http/gracefulShutdown.js';

function makeDeps(overrides: Partial<Parameters<typeof createShutdownHandler>[0]> = {}) {
  const calls: string[] = [];
  const deps = {
    closeServer: vi.fn(async () => {
      calls.push('closeServer');
    }),
    shutdownTelemetry: vi.fn(async () => {
      calls.push('shutdownTelemetry');
    }),
    exit: vi.fn((code: number) => {
      calls.push(`exit:${code}`);
    }),
    logError: vi.fn(),
    closeTimeoutMs: 1_000,
    ...overrides,
  };
  return { deps, calls };
}

describe('createShutdownHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('closes the server, then shuts telemetry down, then exits 0', async () => {
    const { deps, calls } = makeDeps();

    await createShutdownHandler(deps)();

    expect(calls).toEqual(['closeServer', 'shutdownTelemetry', 'exit:0']);
  });

  it('runs once even when SIGTERM and SIGINT both arrive', async () => {
    const { deps } = makeDeps();
    const handler = createShutdownHandler(deps);

    await Promise.all([handler(), handler()]);

    expect(deps.closeServer).toHaveBeenCalledOnce();
    expect(deps.shutdownTelemetry).toHaveBeenCalledOnce();
    expect(deps.exit).toHaveBeenCalledOnce();
  });

  it('stops waiting on a server that will not close so telemetry still flushes before the kill', async () => {
    const { deps, calls } = makeDeps({
      closeServer: vi.fn(() => new Promise<void>(() => undefined)),
    });

    const done = createShutdownHandler(deps)();
    await vi.advanceTimersByTimeAsync(1_000);
    await done;

    expect(deps.logError).toHaveBeenCalledWith(expect.stringContaining('did not close'));
    expect(calls).toEqual(['shutdownTelemetry', 'exit:1']);
  });

  it('still shuts telemetry down and exits 1 when closing the server fails', async () => {
    const failure = new Error('close failed');
    const { deps, calls } = makeDeps({ closeServer: vi.fn().mockRejectedValue(failure) });

    await createShutdownHandler(deps)();

    expect(deps.logError).toHaveBeenCalledWith(failure);
    expect(calls).toEqual(['shutdownTelemetry', 'exit:1']);
  });
});
