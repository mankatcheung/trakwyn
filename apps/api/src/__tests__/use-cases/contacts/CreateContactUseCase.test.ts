import { describe, it, expect, vi } from 'vitest';
import { CreateContactUseCase } from '#src/use-cases/contacts/CreateContactUseCase.js';
import { makeContact, makeContactRepository } from '#src/__tests__/helpers/mocks/contacts.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';

describe('CreateContactUseCase', () => {
  it('throws NOT_FOUND when application does not exist', async () => {
    const useCase = new CreateContactUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(null),
      }),
      contactRepository: makeContactRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'missing', name: 'Jane' })
      .catch((e) => e);
    expect((err as { code: string }).code).toBe('NOT_FOUND');
  });

  it('throws FORBIDDEN when application belongs to another user', async () => {
    const useCase = new CreateContactUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication({ userId: 'other' })),
      }),
      contactRepository: makeContactRepository(),
      generateId: vi.fn(),
    });
    const err = await useCase
      .execute({ userId: 'user-1', applicationId: 'app-1', name: 'Jane' })
      .catch((e) => e);
    expect((err as { code: string }).code).toBe('FORBIDDEN');
  });

  it('creates a contact with the correct data', async () => {
    const contact = makeContact();
    const contactRepository = makeContactRepository({
      create: vi.fn().mockResolvedValue(contact),
    });
    const generateId = vi.fn().mockReturnValue('contact-1');

    const useCase = new CreateContactUseCase({
      applicationRepository: makeApplicationRepository({
        findById: vi.fn().mockResolvedValue(makeApplication()),
      }),
      contactRepository,
      generateId,
    });

    const result = await useCase.execute({
      userId: 'user-1',
      applicationId: 'app-1',
      name: 'Jane Recruiter',
      role: 'Technical Recruiter',
      email: 'jane@example.com',
    });

    expect(result).toEqual(contact);
    expect(contactRepository.create).toHaveBeenCalledWith({
      id: 'contact-1',
      applicationId: 'app-1',
      name: 'Jane Recruiter',
      role: 'Technical Recruiter',
      email: 'jane@example.com',
      phone: null,
      linkedinUrl: null,
      notes: null,
    });
  });
});
