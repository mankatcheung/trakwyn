import { describe, it, expect, vi } from 'vitest';
import { MoveApplicationOnBoardUseCase } from '#src/use-cases/jobs/MoveApplicationOnBoardUseCase.js';
import { makeTransactionManager } from '#src/__tests__/helpers/mocks/infrastructure.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import type { IUpdateApplicationUseCase } from '#src/use-cases/jobs/IUpdateApplicationUseCase.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

/**
 * `column` is what the destination status already holds, before the move.
 * The moved card is looked up separately, exactly as the use case does it.
 */
const setup = (options?: {
  moved?: ReturnType<typeof makeApplication> | null;
  column?: ReturnType<typeof makeApplication>[];
}) => {
  const moved =
    options?.moved === undefined
      ? makeApplication({ id: 'app-1', userId: 'user-1', status: 'applied' })
      : options.moved;

  const applicationRepository: IApplicationRepository = makeApplicationRepository({
    findById: vi.fn().mockResolvedValue(moved),
    findAllByUserId: vi.fn().mockResolvedValue(options?.column ?? []),
    reorderBoard: vi.fn().mockResolvedValue([]),
  });

  const updateApplicationUseCase = stub<IUpdateApplicationUseCase>({
    execute: vi.fn().mockResolvedValue(moved),
  });

  const useCase = new MoveApplicationOnBoardUseCase({
    applicationRepository,
    updateApplicationUseCase,
    transactionManager: makeTransactionManager(),
  });

  return { useCase, applicationRepository, updateApplicationUseCase };
};

describe('MoveApplicationOnBoardUseCase', () => {
  describe('within one column', () => {
    it('renumbers the column and writes no activity log', async () => {
      const column = [
        makeApplication({ id: 'app-1', userId: 'user-1', status: 'applied' }),
        makeApplication({ id: 'app-2', userId: 'user-1', status: 'applied' }),
        makeApplication({ id: 'app-3', userId: 'user-1', status: 'applied' }),
      ];
      const { useCase, applicationRepository, updateApplicationUseCase } = setup({ column });

      await useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        toStatus: 'applied',
        orderedIds: ['app-2', 'app-1', 'app-3'],
      });

      expect(applicationRepository.reorderBoard).toHaveBeenCalledWith('user-1', 'applied', [
        'app-2',
        'app-1',
        'app-3',
      ]);
      // No status change, so nothing delegates to the use case that owns the
      // status_changed log. Reordering is not part of an application's history.
      expect(updateApplicationUseCase.execute).not.toHaveBeenCalled();
    });

    it('returns the destination column as the repository reports it', async () => {
      const reordered = [
        makeApplication({ id: 'app-2', boardPosition: 0 }),
        makeApplication({ id: 'app-1', boardPosition: 1 }),
      ];
      const { useCase, applicationRepository } = setup({
        column: [
          makeApplication({ id: 'app-1', userId: 'user-1', status: 'applied' }),
          makeApplication({ id: 'app-2', userId: 'user-1', status: 'applied' }),
        ],
      });
      vi.mocked(applicationRepository.reorderBoard).mockResolvedValue(reordered);

      const result = await useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        toStatus: 'applied',
        orderedIds: ['app-2', 'app-1'],
      });

      expect(result.map((a) => a.id)).toEqual(['app-2', 'app-1']);
    });
  });

  describe('across columns', () => {
    it('changes status through UpdateApplicationUseCase, then renumbers', async () => {
      const { useCase, applicationRepository, updateApplicationUseCase } = setup({
        moved: makeApplication({ id: 'app-1', userId: 'user-1', status: 'applied' }),
        column: [makeApplication({ id: 'app-9', userId: 'user-1', status: 'interviewing' })],
      });

      await useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        toStatus: 'interviewing',
        orderedIds: ['app-9', 'app-1'],
      });

      // Delegated rather than reimplemented, so appliedAt stamping and the
      // status_changed log keep happening in exactly one place.
      expect(updateApplicationUseCase.execute).toHaveBeenCalledWith({
        userId: 'user-1',
        applicationId: 'app-1',
        status: 'interviewing',
      });
      expect(applicationRepository.reorderBoard).toHaveBeenCalledWith('user-1', 'interviewing', [
        'app-9',
        'app-1',
      ]);
    });

    it('runs the status change and the renumber in one transaction', async () => {
      const transactionManager = makeTransactionManager();
      const applicationRepository = makeApplicationRepository({
        findById: vi
          .fn()
          .mockResolvedValue(makeApplication({ id: 'app-1', userId: 'user-1', status: 'applied' })),
        findAllByUserId: vi.fn().mockResolvedValue([]),
        reorderBoard: vi.fn().mockResolvedValue([]),
      });
      const useCase = new MoveApplicationOnBoardUseCase({
        applicationRepository,
        updateApplicationUseCase: stub<IUpdateApplicationUseCase>({
          execute: vi.fn().mockResolvedValue(makeApplication()),
        }),
        transactionManager,
      });

      await useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        toStatus: 'offered',
        orderedIds: ['app-1'],
      });

      expect(transactionManager.run).toHaveBeenCalledTimes(1);
    });
  });

  describe('validation', () => {
    it.each([
      ['an empty id list', [] as string[]],
      ['a list missing the moved application', ['app-2']],
      ['duplicate ids', ['app-1', 'app-1']],
    ])('rejects %s', async (_label, orderedIds) => {
      const { useCase, applicationRepository } = setup({
        column: [makeApplication({ id: 'app-2', userId: 'user-1', status: 'applied' })],
      });

      const err = await useCase
        .execute({ userId: 'user-1', applicationId: 'app-1', toStatus: 'applied', orderedIds })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
      expect(applicationRepository.reorderBoard).not.toHaveBeenCalled();
    });

    it('rejects more ids than the configured board max', async () => {
      const { useCase, applicationRepository } = setup();
      const orderedIds = ['app-1', ...Array.from({ length: 500 }, (_, i) => `other-${i}`)];

      const err = await useCase
        .execute({ userId: 'user-1', applicationId: 'app-1', toStatus: 'applied', orderedIds })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('VALIDATION');
      expect(applicationRepository.reorderBoard).not.toHaveBeenCalled();
    });

    it('reports a missing application as not found', async () => {
      const { useCase, applicationRepository } = setup({ moved: null });

      const err = await useCase
        .execute({
          userId: 'user-1',
          applicationId: 'app-1',
          toStatus: 'applied',
          orderedIds: ['app-1'],
        })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('NOT_FOUND');
      expect(applicationRepository.reorderBoard).not.toHaveBeenCalled();
    });

    it("refuses to move another user's application", async () => {
      const { useCase, applicationRepository } = setup({
        moved: makeApplication({ id: 'app-1', userId: 'someone-else', status: 'applied' }),
      });

      const err = await useCase
        .execute({
          userId: 'user-1',
          applicationId: 'app-1',
          toStatus: 'applied',
          orderedIds: ['app-1'],
        })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('FORBIDDEN');
      expect(applicationRepository.reorderBoard).not.toHaveBeenCalled();
    });

    it('refuses an orderedIds carrying an id the user does not own', async () => {
      // The column the user actually has holds app-2 only; app-99 is a
      // smuggled id. Renumbering must not run at all.
      const { useCase, applicationRepository } = setup({
        column: [makeApplication({ id: 'app-2', userId: 'user-1', status: 'applied' })],
      });

      const err = await useCase
        .execute({
          userId: 'user-1',
          applicationId: 'app-1',
          toStatus: 'applied',
          orderedIds: ['app-1', 'app-2', 'app-99'],
        })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('FORBIDDEN');
      expect(applicationRepository.reorderBoard).not.toHaveBeenCalled();
    });

    it('refuses an orderedIds carrying an id from a different column', async () => {
      // findAllByUserId is asked for the destination status, so a card sitting
      // in another column simply is not in the returned set.
      const { useCase, applicationRepository } = setup({
        column: [makeApplication({ id: 'app-2', userId: 'user-1', status: 'interviewing' })],
      });
      vi.mocked(applicationRepository.findAllByUserId).mockResolvedValue([]);

      const err = await useCase
        .execute({
          userId: 'user-1',
          applicationId: 'app-1',
          toStatus: 'interviewing',
          orderedIds: ['app-1', 'app-2'],
        })
        .catch((e) => e);

      expect((err as { code: string }).code).toBe('FORBIDDEN');
      expect(applicationRepository.reorderBoard).not.toHaveBeenCalled();
    });
  });
});
