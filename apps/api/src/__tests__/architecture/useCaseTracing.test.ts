import { beforeAll, describe, expect, it } from 'vitest';
import {
  asClass,
  asValue,
  createContainer,
  Lifetime,
  type AwilixContainer,
  type Resolver,
} from 'awilix';

import { useCases } from '#src/http/di/use-cases/index.js';
import { applyUseCaseTracing, UNTRACED_USE_CASES } from '#src/http/di/useCaseTracing.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { isObservabilityEnabled } from '#src/infrastructure/observability/tracing.js';

/**
 * `useCases` is safe to import statically — the dependency rule keeps use
 * cases away from infrastructure, so nothing it pulls in touches a database.
 * The other DI modules are not: `http/di/infrastructure.js` reaches
 * `db/client.ts`, which constructs the real client at module-evaluation time
 * and throws without `DATABASE_URL`. They are loaded through `loadDiModules`
 * below, after the env is set, the same way `container.test.ts` and
 * `di-modules.test.ts` do it.
 */
async function loadDiModules(): Promise<{
  buildContainer: () => AwilixContainer<never>;
  modules: Record<string, Record<string, unknown>>;
}> {
  const [
    { buildContainer },
    { infrastructure },
    { repositories },
    { rateLimiters },
    { mappers },
    { resolvers },
  ] = await Promise.all([
    import('#src/http/di/index.js'),
    import('#src/http/di/infrastructure.js'),
    import('#src/http/di/repositories.js'),
    import('#src/http/di/rate-limiters.js'),
    import('#src/http/di/mappers.js'),
    import('#src/http/di/resolvers.js'),
  ]);

  return {
    buildContainer: buildContainer as unknown as () => AwilixContainer<never>,
    modules: { infrastructure, repositories, rateLimiters, mappers, resolvers },
  };
}

/**
 * Tracing every use case is only true by construction for as long as every
 * use case actually goes through `applyUseCaseTracing` (JEF-347).
 *
 * That holds because `buildContainer` maps the whole `useCases` map at once,
 * so a new domain module under `http/di/use-cases/` is covered the moment it
 * is spread in. The ways it could quietly stop holding are what this file
 * pins down: a use case registered somewhere other than `useCases`, a value
 * in `useCases` that isn't a use case at all, or an exemption that outlives
 * the use case it excused — in the spirit of `mockPlacement.test.ts` and
 * `onDeleteBehaviour.test.ts`.
 */

/**
 * Registrations in `useCases` that are deliberately not use cases.
 *
 * `chatTools` is the injected `LLMToolDefinition[]` that
 * `ChatWithAssistantUseCase` receives — a composition decision made in
 * `http/di`, which is why it sits with the use cases it is injected into.
 * Listing it here means a future non-use-case value has to be a decision
 * rather than an accident.
 */
const NON_USE_CASE_REGISTRATIONS = new Set<string>(['chatTools']);

/**
 * Resolves a registration without booting any infrastructure: `asClass` in
 * PROXY mode only does `new Class(container.cradle)`, and every use-case
 * constructor just stores what it is handed, so a permissive cradle is
 * enough to get a real instance back.
 */
function resolveWithStubCradle<T>(resolver: Resolver<T>): T {
  const cradle = new Proxy({}, { get: () => ({}) });
  const container = {
    cradle,
    options: { injectionMode: 'PROXY' },
  } as unknown as AwilixContainer<Record<string, unknown>>;
  return resolver.resolve(container);
}

/**
 * Every use case defines `execute` on its prototype, so an instance whose
 * own `execute` differs from its prototype's is one the decorator wrapped.
 * Checked structurally rather than by calling `execute`, which would run
 * business logic against stub dependencies.
 */
function isTraced(instance: object): boolean {
  const prototype = Object.getPrototypeOf(instance) as { execute?: unknown };
  return (instance as { execute?: unknown }).execute !== prototype.execute;
}

/** The registration maps keyed by name, so they can be looked up by string. */
const plainByName = useCases as Record<string, Resolver<unknown>>;
const tracedByName = applyUseCaseTracing(useCases) as Record<string, Resolver<unknown>>;

const useCaseEntries = Object.entries(plainByName).filter(
  ([name]) => !NON_USE_CASE_REGISTRATIONS.has(name),
);

describe('use-case tracing', () => {
  beforeAll(() => {
    // `db/client.ts` constructs the real client at module-evaluation time, so
    // these must be set before the DI modules are imported in the tests below.
    process.env[ENV.DATABASE_URL] ??= 'pglite:memory';
    process.env[ENV.JWT_SECRET] ??= 'test-secret';
    process.env[ENV.JWT_REFRESH_SECRET] ??= 'test-refresh-secret';
  });

  it('registers every use case under a name ending in UseCase', () => {
    const misnamed = useCaseEntries.filter(([name]) => !name.endsWith('UseCase')).map(([n]) => n);

    expect(misnamed).toEqual([]);
  });

  it('holds nothing but use cases and the values listed as not being one', () => {
    const notAUseCase = useCaseEntries
      .filter(([, resolver]) => {
        const instance = resolveWithStubCradle(resolver as Resolver<object>);
        return typeof (instance as { execute?: unknown })?.execute !== 'function';
      })
      .map(([name]) => name);

    expect(notAUseCase).toEqual([]);
  });

  /**
   * The acceptance criterion: a registered use case that is not traced fails
   * a test. Add a domain module and forget to route it through `useCases`,
   * or special-case a name inside `applyUseCaseTracing`, and this goes red.
   */
  it('traces every registered use case', () => {
    const untraced = useCaseEntries
      .filter(([name]) => !UNTRACED_USE_CASES.has(name))
      .filter(([name]) => !isTraced(resolveWithStubCradle(tracedByName[name] as Resolver<object>)))
      .map(([name]) => name);

    expect(untraced).toEqual([]);
  });

  it('leaves the deliberately untraced use cases unwrapped', () => {
    for (const name of UNTRACED_USE_CASES) {
      const instance = resolveWithStubCradle(tracedByName[name] as Resolver<object>);

      expect(isTraced(instance)).toBe(false);
    }
  });

  it('names a real registration in every exemption, so none outlives its use case', () => {
    const stale = [...UNTRACED_USE_CASES].filter((name) => !(name in useCases));

    expect(stale).toEqual([]);
  });

  it('returns non-use-case registrations untouched', () => {
    for (const name of NON_USE_CASE_REGISTRATIONS) {
      const value = resolveWithStubCradle(tracedByName[name] as Resolver<object>);

      expect(value).toEqual(resolveWithStubCradle(plainByName[name] as Resolver<object>));
    }
  });

  it('keeps each registration TRANSIENT', () => {
    const wrong = useCaseEntries
      .filter(([name]) => tracedByName[name].lifetime !== Lifetime.TRANSIENT)
      .map(([name]) => name);

    expect(wrong).toEqual([]);
  });

  /**
   * A use case registered in another DI module would never reach
   * `applyUseCaseTracing`, so it would be silently untraced with nothing to
   * catch it. Keeping them all in one map is what makes the mapping total.
   */
  it('registers no use case outside the useCases map', async () => {
    const { modules } = await loadDiModules();

    const strays = Object.entries(modules).flatMap(([module, registrations]) =>
      Object.keys(registrations)
        .filter((name) => name.endsWith('UseCase'))
        .map((name) => `${module}.${name}`),
    );

    expect(strays).toEqual([]);
  });

  /**
   * Dev and test resolve the plain instances (JEF-345): the container gets
   * the very same resolver objects, so there is no proxy in the hot path at
   * all — not merely a proxy around a no-op tracer.
   */
  it('registers the unwrapped resolvers when observability is disabled', async () => {
    expect(isObservabilityEnabled).toBe(false);
    const { buildContainer } = await loadDiModules();

    const registrations = buildContainer().registrations as Record<string, Resolver<unknown>>;

    for (const [name, resolver] of useCaseEntries) {
      expect(registrations[name]).toBe(resolver);
    }
  }, 15_000);

  it('wraps the resolvers when tracing is applied', () => {
    for (const [name, resolver] of useCaseEntries) {
      if (UNTRACED_USE_CASES.has(name)) continue;

      expect(tracedByName[name]).not.toBe(resolver);
    }
  });

  /**
   * The rest of this file resolves against a stub container, which exercises
   * the wrapper but not Awilix itself. Overriding `resolve` on a spread copy
   * of a registration is the one assumption the whole approach rests on, so
   * it is checked against a real container — including that the lifetime
   * survives, since `asClass(..., { lifetime: TRANSIENT })` carries it on the
   * object being spread.
   */
  describe('against a real Awilix container', () => {
    class ExampleUseCase {
      constructor(private readonly deps: { someDependency: string }) {}
      execute(): string {
        return this.deps.someDependency;
      }
    }

    const build = () => {
      const container = createContainer<{
        someDependency: string;
        exampleUseCase: ExampleUseCase;
      }>();
      // `applyUseCaseTracing` is typed against the real Cradle, which this
      // stand-in use case is deliberately not part of.
      const traced = applyUseCaseTracing({
        exampleUseCase: asClass(ExampleUseCase, { lifetime: Lifetime.TRANSIENT }),
      } as never) as unknown as Record<string, Resolver<ExampleUseCase>>;

      container.register({ someDependency: asValue('injected'), ...traced });
      return container;
    };

    it('resolves a traced instance whose dependencies were still injected', () => {
      const instance = build().resolve('exampleUseCase');

      expect(isTraced(instance)).toBe(true);
      expect(instance.execute()).toBe('injected');
    });

    it('keeps the registration transient, so each resolve is a new instance', () => {
      const container = build();

      // Compared as a boolean rather than with `not.toBe`, whose failure diff
      // would walk into the injected Awilix cradle and try to resolve every
      // property it touches.
      const sameInstance =
        container.resolve('exampleUseCase') === container.resolve('exampleUseCase');

      expect(sameInstance).toBe(false);
    });
  });
});
