import { describe, it, expect, vi, beforeEach } from 'vitest';

const {
  registerMock,
  createAddHookMessageChannelMock,
  waitForAllMessagesAcknowledgedMock,
  startObservabilityMock,
  tracingState,
  registerOptions,
} = vi.hoisted(() => {
  const registerOptions = { data: { include: [] }, transferList: [] };
  const waitForAllMessagesAcknowledgedMock = vi.fn().mockResolvedValue(undefined);
  return {
    registerMock: vi.fn(),
    waitForAllMessagesAcknowledgedMock,
    createAddHookMessageChannelMock: vi.fn(() => ({
      registerOptions,
      waitForAllMessagesAcknowledged: waitForAllMessagesAcknowledgedMock,
    })),
    startObservabilityMock: vi.fn(),
    tracingState: { isObservabilityEnabled: true },
    registerOptions,
  };
});

vi.mock('node:module', () => ({ register: registerMock }));

vi.mock('import-in-the-middle', () => ({
  createAddHookMessageChannel: createAddHookMessageChannelMock,
}));

vi.mock('#src/infrastructure/observability/tracing.js', () => ({
  get isObservabilityEnabled() {
    return tracingState.isObservabilityEnabled;
  },
  startObservability: startObservabilityMock,
}));

const { registerInstrumentation } =
  await import('#src/infrastructure/observability/registerInstrumentation.js');

describe('registerInstrumentation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tracingState.isObservabilityEnabled = true;
  });

  it('registers the import-in-the-middle ESM loader, limited to hooked modules, when observability is enabled', async () => {
    await registerInstrumentation();

    expect(registerMock).toHaveBeenCalledOnce();
    expect(registerMock).toHaveBeenCalledWith(
      'import-in-the-middle/hook.mjs',
      expect.stringMatching(/^file:/),
      registerOptions,
    );
  });

  it('registers the loader before starting the SDK, then waits for the loader to acknowledge its hooks', async () => {
    await registerInstrumentation();

    const [registerOrder] = registerMock.mock.invocationCallOrder;
    const [startOrder] = startObservabilityMock.mock.invocationCallOrder;
    const [waitOrder] = waitForAllMessagesAcknowledgedMock.mock.invocationCallOrder;
    expect(registerOrder).toBeLessThan(startOrder);
    expect(startOrder).toBeLessThan(waitOrder);
  });

  it('does not register the loader when observability is disabled, but still lets tracing log why', async () => {
    tracingState.isObservabilityEnabled = false;

    await registerInstrumentation();

    expect(registerMock).not.toHaveBeenCalled();
    expect(createAddHookMessageChannelMock).not.toHaveBeenCalled();
    expect(startObservabilityMock).toHaveBeenCalledOnce();
  });
});
