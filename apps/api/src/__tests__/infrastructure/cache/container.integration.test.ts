/**
 * Integration test: verifies that the Awilix container wires
 * CachedApplicationRepository (not DrizzleApplicationRepository) as the
 * `applicationRepository` that use cases receive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createContainer, asClass, asValue, Lifetime } from 'awilix';
import { MemoryCache } from '#src/infrastructure/cache/MemoryCache.js';
import { CachedApplicationRepository } from '#src/infrastructure/db/repositories/CachedApplicationRepository.js';
import { CachedNoteRepository } from '#src/infrastructure/db/repositories/CachedNoteRepository.js';
import { CachedDocumentRepository } from '#src/infrastructure/db/repositories/CachedDocumentRepository.js';
import { GetApplicationsUseCase } from '#src/use-cases/jobs/GetApplicationsUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

/**
 * Builds a minimal container matching the real app's registration names,
 * using a fake inner repo so we can count db calls.
 */
function buildTestContainer() {
  const inner = makeApplicationRepository();
  const cache = new MemoryCache(60_000);

  const container = createContainer();
  container.register({
    cache: asValue(cache),
    drizzleApplicationRepository: asValue(inner),
    applicationRepository: asClass(CachedApplicationRepository, { lifetime: Lifetime.SINGLETON }),
    getApplicationsUseCase: asClass(GetApplicationsUseCase, { lifetime: Lifetime.TRANSIENT }),
  });

  return { container, inner, cache };
}

describe('container wiring: applicationRepository is the cached decorator', () => {
  let ctx: ReturnType<typeof buildTestContainer>;

  beforeEach(() => {
    ctx = buildTestContainer();
  });

  it('resolves applicationRepository as CachedApplicationRepository', () => {
    const repo = ctx.container.resolve('applicationRepository');
    expect(repo).toBeInstanceOf(CachedApplicationRepository);
  });

  it('use case receives CachedApplicationRepository via applicationRepository dep', () => {
    const useCase = ctx.container.resolve<GetApplicationsUseCase>('getApplicationsUseCase');
    // Access the private dep through Awilix's cradle proxy
    const repo = (useCase as unknown as { deps: { applicationRepository: unknown } }).deps
      .applicationRepository;
    expect(repo).toBeInstanceOf(CachedApplicationRepository);
  });

  it('GetApplicationsUseCase hits DB once then serves from cache on repeated calls', async () => {
    const app = makeApplication({ userId: 'user-1' });
    vi.mocked(ctx.inner.findAllByUserId).mockResolvedValue([app]);

    const useCase = ctx.container.resolve<GetApplicationsUseCase>('getApplicationsUseCase');

    const first = await useCase.execute({ userId: 'user-1' });
    const second = await useCase.execute({ userId: 'user-1' });

    expect(first).toEqual([app]);
    expect(second).toEqual([app]);
    // DB was only hit once — the second call was served from the in-memory cache
    expect(ctx.inner.findAllByUserId).toHaveBeenCalledOnce();
  });
});

describe('container wiring: noteRepository and documentRepository', () => {
  it('resolves noteRepository as CachedNoteRepository', () => {
    const container = createContainer();
    container.register({
      cache: asValue(new MemoryCache()),
      drizzleNoteRepository: asValue({
        findAllByApplicationId: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      }),
      noteRepository: asClass(CachedNoteRepository, { lifetime: Lifetime.SINGLETON }),
    });
    expect(container.resolve('noteRepository')).toBeInstanceOf(CachedNoteRepository);
  });

  it('resolves documentRepository as CachedDocumentRepository', () => {
    const container = createContainer();
    container.register({
      cache: asValue(new MemoryCache()),
      drizzleDocumentRepository: asValue({
        findAllByApplicationId: vi.fn(),
        findById: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
      }),
      drizzleApplicationRepository: asValue({ findByIdIncludingTrashed: vi.fn() }),
      documentRepository: asClass(CachedDocumentRepository, { lifetime: Lifetime.SINGLETON }),
    });
    expect(container.resolve('documentRepository')).toBeInstanceOf(CachedDocumentRepository);
  });
});
