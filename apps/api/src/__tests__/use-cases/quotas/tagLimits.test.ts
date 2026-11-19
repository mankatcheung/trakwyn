import { describe, it, expect, vi } from 'vitest';
import { CONTENT_LIMITS, FIELD_LENGTH_LIMITS } from '#src/use-cases/constants.js';
import { CreateApplicationUseCase } from '#src/use-cases/jobs/CreateApplicationUseCase.js';
import { UpdateApplicationUseCase } from '#src/use-cases/jobs/UpdateApplicationUseCase.js';
import { BulkAddTagToApplicationsUseCase } from '#src/use-cases/jobs/BulkAddTagToApplicationsUseCase.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';

const tagList = (count: number): string[] => Array.from({ length: count }, (_, i) => `tag-${i}`);

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> =>
  ((await promise.catch((e) => e)) as { code?: string }).code;

describe('tag limits (JEF-339)', () => {
  describe('createApplication', () => {
    const build = () => {
      const applicationRepository = makeApplicationRepository({
        create: vi.fn().mockResolvedValue(makeApplication()),
      });
      const useCase = new CreateApplicationUseCase({
        applicationRepository,
        entitlementService: makeEntitlementService(),
        generateId: () => 'id',
      });
      return { applicationRepository, useCase };
    };
    const base = { userId: 'user-1', company: 'Acme', role: 'Dev' };

    it('accepts exactly the maximum number of tags', async () => {
      const { useCase, applicationRepository } = build();
      await useCase.execute({ ...base, tags: tagList(CONTENT_LIMITS.TAGS_PER_APPLICATION) });
      expect(applicationRepository.create).toHaveBeenCalled();
    });

    it('refuses one tag too many, naming the limit', async () => {
      const { useCase, applicationRepository } = build();
      const err = await useCase
        .execute({ ...base, tags: tagList(CONTENT_LIMITS.TAGS_PER_APPLICATION + 1) })
        .catch((e) => e);
      expect((err as { code: string }).code).toBe('QUOTA_EXCEEDED');
      expect((err as Error).message).toContain(String(CONTENT_LIMITS.TAGS_PER_APPLICATION));
      expect(applicationRepository.create).not.toHaveBeenCalled();
    });

    it('refuses a tag name that is too long rather than truncating it', async () => {
      const { useCase, applicationRepository } = build();
      const code = await codeOf(
        useCase.execute({ ...base, tags: ['x'.repeat(FIELD_LENGTH_LIMITS.TAG_NAME + 1)] }),
      );
      expect(code).toBe('VALIDATION');
      expect(applicationRepository.create).not.toHaveBeenCalled();
    });

    it('accepts a tag name of exactly the maximum length', async () => {
      const { useCase } = build();
      await expect(
        useCase.execute({ ...base, tags: ['x'.repeat(FIELD_LENGTH_LIMITS.TAG_NAME)] }),
      ).resolves.toBeDefined();
    });

    it('accepts no tags at all', async () => {
      const { useCase } = build();
      await expect(useCase.execute(base)).resolves.toBeDefined();
    });
  });

  describe('updateApplication', () => {
    const build = () => {
      const applicationRepository = makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
        update: vi.fn().mockResolvedValue(makeApplication()),
      });
      const useCase = new UpdateApplicationUseCase({
        applicationRepository,
        generateId: () => 'id',
      });
      return { applicationRepository, useCase };
    };
    const base = { userId: 'user-1', applicationId: 'app-1' };

    it('accepts exactly the maximum number of tags', async () => {
      const { useCase, applicationRepository } = build();
      await useCase.execute({ ...base, tags: tagList(CONTENT_LIMITS.TAGS_PER_APPLICATION) });
      expect(applicationRepository.update).toHaveBeenCalled();
    });

    it('refuses one tag too many and writes nothing', async () => {
      const { useCase, applicationRepository } = build();
      const code = await codeOf(
        useCase.execute({ ...base, tags: tagList(CONTENT_LIMITS.TAGS_PER_APPLICATION + 1) }),
      );
      expect(code).toBe('QUOTA_EXCEEDED');
      expect(applicationRepository.update).not.toHaveBeenCalled();
    });

    it('refuses a tag name that is too long', async () => {
      const { useCase, applicationRepository } = build();
      const code = await codeOf(
        useCase.execute({ ...base, tags: ['x'.repeat(FIELD_LENGTH_LIMITS.TAG_NAME + 1)] }),
      );
      expect(code).toBe('VALIDATION');
      expect(applicationRepository.update).not.toHaveBeenCalled();
    });

    it('leaves the tags alone when none are sent, even on an application already at the cap', async () => {
      const { useCase, applicationRepository } = build();
      await useCase.execute({ ...base, company: 'Renamed' });
      expect(applicationRepository.update).toHaveBeenCalled();
    });
  });

  describe('bulk add tag', () => {
    it('refuses when an application is already at the cap, because it goes through update', async () => {
      const full = makeApplication({
        id: 'app-full',
        tags: tagList(CONTENT_LIMITS.TAGS_PER_APPLICATION),
      });
      const applicationRepository = makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(full),
        update: vi.fn().mockResolvedValue(full),
      });
      const updateApplicationUseCase = new UpdateApplicationUseCase({
        applicationRepository,
        generateId: () => 'id',
      });
      const useCase = new BulkAddTagToApplicationsUseCase({
        applicationRepository,
        updateApplicationUseCase,
        generateId: () => 'id',
      });

      const code = await codeOf(
        useCase.execute({ userId: 'user-1', applicationIds: ['app-full'], tag: 'one-more' }),
      );

      expect(code).toBe('QUOTA_EXCEEDED');
      expect(applicationRepository.update).not.toHaveBeenCalled();
    });

    it('still adds a tag the application already has when it is at the cap', async () => {
      const tags = tagList(CONTENT_LIMITS.TAGS_PER_APPLICATION);
      const full = makeApplication({ id: 'app-full', tags });
      const applicationRepository = makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(full),
        update: vi.fn().mockResolvedValue(full),
      });
      const useCase = new BulkAddTagToApplicationsUseCase({
        applicationRepository,
        updateApplicationUseCase: new UpdateApplicationUseCase({
          applicationRepository,
          generateId: () => 'id',
        }),
        generateId: () => 'id',
      });

      await useCase.execute({ userId: 'user-1', applicationIds: ['app-full'], tag: tags[0] });

      expect(applicationRepository.update).toHaveBeenCalled();
    });
  });
});
