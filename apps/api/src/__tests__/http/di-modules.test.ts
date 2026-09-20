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

  /**
   * JEF-350: rejections are logged and counted by a decorator rather than by
   * the nineteen use cases that consume a limiter, which is only true for as
   * long as every registration goes through `limiter()`. A new limiter added
   * with a bare `asValue(new RateLimiter(...))` would rate-limit correctly
   * and report nothing — silently, which is the failure mode the ticket
   * exists to remove. So it is asserted rather than described.
   */
  it('wraps every rate limiter in the instrumented decorator', async () => {
    const { buildContainer } = await import('#src/http/container.js');
    const { InstrumentedRateLimiter } =
      await import('#src/infrastructure/rateLimit/InstrumentedRateLimiter.js');
    const { makeLogger } = await import('#src/__tests__/helpers/mocks/infrastructure.js');
    const { asValue } = await import('awilix');
    const { rateLimiters } = await loadModules();

    const container = buildContainer();
    container.register({ logger: asValue(makeLogger()) });

    const names = Object.keys(rateLimiters);
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(container.resolve(name), name).toBeInstanceOf(InstrumentedRateLimiter);
    }
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
