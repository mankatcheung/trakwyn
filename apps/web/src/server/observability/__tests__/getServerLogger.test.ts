import { beforeEach, describe, expect, it, vi } from 'vitest';

const createServerLogger = vi.fn();
const readServerLogConfig = vi.fn();

vi.mock('@tanstack/react-start', () => ({
  createServerOnlyFn: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));
vi.mock('../serverLogConfig', () => ({ readServerLogConfig }));
vi.mock('../serverLogger', () => ({ createServerLogger }));

describe('getServerLogger', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    readServerLogConfig.mockReturnValue({ level: 'info' });
    createServerLogger.mockImplementation(() => ({ id: Symbol('logger') }));
  });

  it('builds the logger from the env values and the release', async () => {
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_key');
    vi.stubEnv('VITE_POSTHOG_HOST', 'https://ph.test');
    vi.stubEnv('VITE_APP_RELEASE', 'abc123');
    const { getServerLogger } = await import('../getServerLogger');
    getServerLogger();
    expect(readServerLogConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        VITE_POSTHOG_KEY: 'phc_key',
        VITE_POSTHOG_HOST: 'https://ph.test',
      }),
    );
    expect(createServerLogger).toHaveBeenCalledWith({
      config: { level: 'info' },
      release: 'abc123',
    });
  });

  it('builds it once and hands back the same instance', async () => {
    const { getServerLogger } = await import('../getServerLogger');
    const first = getServerLogger();
    expect(getServerLogger()).toBe(first);
    expect(createServerLogger).toHaveBeenCalledOnce();
  });
});
