import { afterEach, describe, expect, it, vi } from 'vitest';

// devPorts.ts reads WEB_PORT / API_PORT once, at import: the environment first,
// then apps/web/.env, then 3000 / 3001. The main checkout and CI set neither.
// Every case stubs the environment, so a developer's own .env cannot change it.
async function loadDevPorts() {
  vi.resetModules();
  return import('../../../devPorts.ts');
}

describe('devPorts', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('takes this checkout’s ports from the environment', async () => {
    vi.stubEnv('WEB_PORT', '3212');
    vi.stubEnv('API_PORT', '3213');

    const ports = await loadDevPorts();

    expect(ports.webPort).toBe(3212);
    expect(ports.apiPort).toBe(3213);
    expect(ports.webOrigin).toBe('http://localhost:3212');
    expect(ports.apiOrigin).toBe('http://localhost:3213');
  });

  it.each(['abc', '0', '-1', '70000', '3000.5'])(
    'falls back to the defaults for the invalid port %s',
    async (value) => {
      vi.stubEnv('WEB_PORT', value);
      vi.stubEnv('API_PORT', value);

      const ports = await loadDevPorts();

      expect(ports.webPort).toBe(ports.DEFAULT_WEB_PORT);
      expect(ports.apiPort).toBe(ports.DEFAULT_API_PORT);
    },
  );

  it('keeps the defaults the main checkout and CI rely on', async () => {
    const ports = await loadDevPorts();

    expect(ports.DEFAULT_WEB_PORT).toBe(3000);
    expect(ports.DEFAULT_API_PORT).toBe(3001);
  });
});
