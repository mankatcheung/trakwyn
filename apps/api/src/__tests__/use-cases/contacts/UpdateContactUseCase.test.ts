import { describe, it, expect, vi } from 'vitest';
import { UpdateContactUseCase } from '#src/use-cases/contacts/UpdateContactUseCase.js';
import { makeContact, makeContactRepository } from '#src/__tests__/helpers/mocks/contacts.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('UpdateContactUseCase', () => {
  it('throws NOT_FOUND when contact does not exist', async () => {
    const useCase = new UpdateContactUseCase({
      applicationRepository: makeApplicationRepository(),
      contactRepository: makeContactRepository({ findById: vi.fn().mockResolvedValue(null) }),
    });
    const err = await useCase.execute({ userId: 'user-1', contactId: 'missing' }).catch((e) => e);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when application belongs to another user', async () => {
    const useCase = new UpdateContactUseCase({
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

  it('updates and returns the contact', async () => {
    const updated = makeContact({ name: 'Updated Name' });
    const contactRepository = makeContactRepository({
      findById: vi.fn().mockResolvedValue(makeContact()),
      update: vi.fn().mockResolvedValue(updated),
    });
    const useCase = new UpdateContactUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      contactRepository,
    });
    const result = await useCase.execute({
      userId: 'user-1',
      contactId: 'contact-1',
      name: 'Updated Name',
    });
    expect(result).toEqual(updated);
    expect(contactRepository.update).toHaveBeenCalledWith('contact-1', { name: 'Updated Name' });
  });
});
