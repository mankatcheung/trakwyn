import { describe, it, expect, vi } from 'vitest';
import { DeleteContactUseCase } from '#src/use-cases/contacts/DeleteContactUseCase.js';
import { makeContact, makeContactRepository } from '#src/__tests__/helpers/mocks/contacts.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('DeleteContactUseCase', () => {
  it('throws NOT_FOUND when contact does not exist', async () => {
    const useCase = new DeleteContactUseCase({
      applicationRepository: makeApplicationRepository(),
      contactRepository: makeContactRepository({ findById: vi.fn().mockResolvedValue(null) }),
    });
    const err = await useCase.execute({ userId: 'user-1', contactId: 'missing' }).catch((e) => e);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when application belongs to another user', async () => {
    const useCase = new DeleteContactUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other' })),
      }),
      contactRepository: makeContactRepository({
        findById: vi.fn().mockResolvedValue(makeContact()),
      }),
    });
    const err = await useCase.execute({ userId: 'user-1', contactId: 'contact-1' }).catch((e) => e);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('deletes the contact', async () => {
    const contactRepository = makeContactRepository({
      findById: vi.fn().mockResolvedValue(makeContact()),
      delete: vi.fn().mockResolvedValue(undefined),
    });
    const useCase = new DeleteContactUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      contactRepository,
    });
    await useCase.execute({ userId: 'user-1', contactId: 'contact-1' });
    expect(contactRepository.delete).toHaveBeenCalledWith('contact-1', 'app-1');
  });
});
