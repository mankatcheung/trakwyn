import { describe, it, expect, vi } from 'vitest';
import { CreateCertificationUseCase } from '#src/use-cases/certification/CreateCertificationUseCase.js';
import { UpdateCertificationUseCase } from '#src/use-cases/certification/UpdateCertificationUseCase.js';
import { DeleteCertificationUseCase } from '#src/use-cases/certification/DeleteCertificationUseCase.js';
import { CreateLanguageUseCase } from '#src/use-cases/language/CreateLanguageUseCase.js';
import { UpdateLanguageUseCase } from '#src/use-cases/language/UpdateLanguageUseCase.js';
import { DeleteLanguageUseCase } from '#src/use-cases/language/DeleteLanguageUseCase.js';
import { CONTENT_LIMITS, PROFILE_ENTRY } from '#src/use-cases/constants.js';
import {
  NotFoundError,
  QuotaExceededError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import {
  makeCertification,
  makeCertificationRepository,
  makeLanguage,
  makeLanguageRepository,
} from '#src/__tests__/helpers/mocks/profile.js';

const generateId = () => 'new-id';

describe('certifications (JEF-592)', () => {
  it('creates one with trimmed text and blank optional fields stored as null', async () => {
    const repo = makeCertificationRepository({
      create: vi.fn().mockResolvedValue(makeCertification()),
    });
    await new CreateCertificationUseCase({ certificationRepository: repo, generateId }).execute({
      userId: 'user-1',
      name: '  CKA  ',
      issuer: '   ',
      credentialUrl: ' https://example.com/cka ',
      issuedAt: new Date('2023-05-01'),
    });

    expect(repo.create).toHaveBeenCalledWith({
      id: 'new-id',
      userId: 'user-1',
      name: 'CKA',
      issuer: null,
      issuedAt: new Date('2023-05-01'),
      expiresAt: null,
      credentialUrl: 'https://example.com/cka',
    });
  });

  it('refuses a blank name, a link that is not http(s), and an over-long name', async () => {
    const useCase = new CreateCertificationUseCase({
      certificationRepository: makeCertificationRepository(),
      generateId,
    });
    await expect(useCase.execute({ userId: 'u', name: '  ' })).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(
      useCase.execute({ userId: 'u', name: 'CKA', credentialUrl: 'javascript:alert(1)' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      useCase.execute({ userId: 'u', name: 'x'.repeat(PROFILE_ENTRY.SHORT_FIELD_MAX_CHARS + 1) }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('refuses a new one past the per-user cap', async () => {
    const repo = makeCertificationRepository({
      findAllByUserId: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: CONTENT_LIMITS.CERTIFICATIONS_PER_USER }, () => makeCertification()),
        ),
    });
    await expect(
      new CreateCertificationUseCase({ certificationRepository: repo, generateId }).execute({
        userId: 'user-1',
        name: 'CKA',
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('updates only what was sent and clears a field sent as null', async () => {
    const repo = makeCertificationRepository({
      findById: vi.fn().mockResolvedValue(makeCertification()),
      update: vi.fn().mockResolvedValue(makeCertification()),
    });
    await new UpdateCertificationUseCase({ certificationRepository: repo }).execute({
      id: 'cert-1',
      userId: 'user-1',
      issuer: null,
      name: ' New name ',
    });
    expect(repo.update).toHaveBeenCalledWith('cert-1', { issuer: null, name: 'New name' });
  });

  it('will not update or delete another user’s entry', async () => {
    const repo = makeCertificationRepository({
      findById: vi.fn().mockResolvedValue(makeCertification({ userId: 'someone-else' })),
    });
    await expect(
      new UpdateCertificationUseCase({ certificationRepository: repo }).execute({
        id: 'cert-1',
        userId: 'user-1',
        name: 'x',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(
      new DeleteCertificationUseCase({ certificationRepository: repo }).execute({
        id: 'cert-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(repo.update).not.toHaveBeenCalled();
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('deletes an entry the user owns', async () => {
    const repo = makeCertificationRepository({
      findById: vi.fn().mockResolvedValue(makeCertification()),
    });
    await new DeleteCertificationUseCase({ certificationRepository: repo }).execute({
      id: 'cert-1',
      userId: 'user-1',
    });
    expect(repo.delete).toHaveBeenCalledWith('cert-1', 'user-1');
  });
});

describe('languages (JEF-592)', () => {
  it('creates one and trims the level', async () => {
    const repo = makeLanguageRepository({ create: vi.fn().mockResolvedValue(makeLanguage()) });
    await new CreateLanguageUseCase({ languageRepository: repo, generateId }).execute({
      userId: 'user-1',
      name: ' Spanish ',
      proficiency: ' Intermediate ',
    });
    expect(repo.create).toHaveBeenCalledWith({
      id: 'new-id',
      userId: 'user-1',
      name: 'Spanish',
      proficiency: 'Intermediate',
    });
  });

  it('refuses a blank name and a new one past the cap', async () => {
    await expect(
      new CreateLanguageUseCase({
        languageRepository: makeLanguageRepository(),
        generateId,
      }).execute({ userId: 'u', name: '' }),
    ).rejects.toBeInstanceOf(ValidationError);

    const full = makeLanguageRepository({
      findAllByUserId: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: CONTENT_LIMITS.LANGUAGES_PER_USER }, () => makeLanguage()),
        ),
    });
    await expect(
      new CreateLanguageUseCase({ languageRepository: full, generateId }).execute({
        userId: 'u',
        name: 'German',
      }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('updates, and refuses another user’s entry', async () => {
    const own = makeLanguageRepository({
      findById: vi.fn().mockResolvedValue(makeLanguage()),
      update: vi.fn().mockResolvedValue(makeLanguage()),
    });
    await new UpdateLanguageUseCase({ languageRepository: own }).execute({
      id: 'lang-1',
      userId: 'user-1',
      proficiency: null,
    });
    expect(own.update).toHaveBeenCalledWith('lang-1', { proficiency: null });

    const foreign = makeLanguageRepository({
      findById: vi.fn().mockResolvedValue(makeLanguage({ userId: 'other' })),
    });
    await expect(
      new DeleteLanguageUseCase({ languageRepository: foreign }).execute({
        id: 'lang-1',
        userId: 'user-1',
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
