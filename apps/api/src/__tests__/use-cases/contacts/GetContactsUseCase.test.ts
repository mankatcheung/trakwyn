import { describe, it, expect, vi } from 'vitest';
import { GetContactsUseCase } from '#src/use-cases/contacts/GetContactsUseCase.js';
import { makeContact, makeContactRepository } from '#src/__tests__/helpers/mocks/contacts.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('GetContactsUseCase', () => {
  it('throws NOT_FOUND when application does not exist', async () => {
    const useCase = new GetContactsUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(null),
      }),
      contactRepository: makeContactRepository(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'missing' })
      .catch((e) => e);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN for a different user', async () => {
    const useCase = new GetContactsUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other' })),
      }),
      contactRepository: makeContactRepository(),
    });
    const err = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' }).catch((e) => e);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('returns contacts for the application', async () => {
    const contacts = [makeContact(), makeContact({ id: 'contact-2', name: 'Bob' })];
    const useCase = new GetContactsUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      contactRepository: makeContactRepository({
        findAllByApplicationId: vi.fn().mockResolvedValue(contacts),
      }),
    });
    const result = await useCase.execute({ userId: 'user-1', applicationId: 'app-1' });
    expect(result).toEqual(contacts);
  });
});
