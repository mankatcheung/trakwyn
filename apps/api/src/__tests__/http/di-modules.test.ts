import { describe, it, expect, beforeAll } from 'vitest';
import { ENV } from '#src/infrastructure/config/constants.js';

describe('DI modules', () => {
  beforeAll(() => {
    // client.ts constructs the real libSQL client at module-evaluation
    // time, so these must be set before the di modules are imported below.
    process.env[ENV.DATABASE_URL] ??= 'pglite:memory';
    process.env[ENV.JWT_SECRET] ??= 'test-secret';
    process.env[ENV.JWT_REFRESH_SECRET] ??= 'test-refresh-secret';
  });

  async function loadModules(): Promise<Record<string, Record<string, unknown>>> {
    const [
      { infrastructure },
      { repositories },
      { rateLimiters },
      { mappers },
      { resolvers },
      { useCases },
    ] = await Promise.all([
      import('#src/http/di/infrastructure.js'),
      import('#src/http/di/repositories.js'),
      import('#src/http/di/rate-limiters.js'),
      import('#src/http/di/mappers.js'),
      import('#src/http/di/resolvers.js'),
      import('#src/http/di/use-cases/index.js'),
    ]);

    return {
      infrastructure,
      repositories,
      rateLimiters,
      mappers,
      resolvers,
      useCases,
    };
  }

  it('each module registers at least one dependency', async () => {
    const modules = await loadModules();

    for (const [name, module] of Object.entries(modules)) {
      expect(Object.keys(module).length, name).toBeGreaterThan(0);
    }
  });

  it('registers every dependency exactly once across modules', async () => {
    const modules = await loadModules();

    const keys = Object.values(modules).flatMap((module) => Object.keys(module));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('buildContainer registers exactly the union of the DI module keys', async () => {
    const modules = await loadModules();
    const { buildContainer } = await import('#src/http/container.js');

    const moduleKeys = Object.values(modules)
      .flatMap((module) => Object.keys(module))
      .sort();
    const container = buildContainer();

    expect(Object.keys(container.registrations).sort()).toEqual(moduleKeys);
  });
});
