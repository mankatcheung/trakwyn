import { describe, it, expect, vi } from 'vitest';
import { CONTENT_LIMITS, FIELD_LENGTH_LIMITS } from '#src/use-cases/constants.js';
import { CreateNoteUseCase } from '#src/use-cases/notes/CreateNoteUseCase.js';
import { UpdateNoteUseCase } from '#src/use-cases/notes/UpdateNoteUseCase.js';
import { CreateContactUseCase } from '#src/use-cases/contacts/CreateContactUseCase.js';
import { CreateInterviewRoundUseCase } from '#src/use-cases/interviewRounds/CreateInterviewRoundUseCase.js';
import { CreateOfferUseCase } from '#src/use-cases/offers/CreateOfferUseCase.js';
import { CreateDocumentDraftUseCase } from '#src/use-cases/documents/CreateDocumentDraftUseCase.js';
import { GenerateResumeDraftUseCase } from '#src/use-cases/documents/GenerateResumeDraftUseCase.js';
import { GenerateCoverLetterDraftUseCase } from '#src/use-cases/documents/GenerateCoverLetterDraftUseCase.js';
import { makeUserRepository } from '#src/__tests__/helpers/mocks/user.js';
import { makeApplication, makeApplicationRepository } from '#src/__tests__/helpers/mocks/jobs.js';
import { makeNote, makeNoteRepository } from '#src/__tests__/helpers/mocks/notes.js';
import { makeContact, makeContactRepository } from '#src/__tests__/helpers/mocks/contacts.js';
import {
  makeInterviewRound,
  makeInterviewRoundRepository,
} from '#src/__tests__/helpers/mocks/interviews.js';
import { makeOffer, makeOfferRepository } from '#src/__tests__/helpers/mocks/offers.js';
import {
  makeDocumentDraft,
  makeDocumentDraftRepository,
  makeDocumentRepository,
} from '#src/__tests__/helpers/mocks/documents.js';
import { makeEntitlementService } from '#src/__tests__/helpers/mocks/plans.js';

const ownedApp = () =>
  makeApplicationRepository({ findById: vi.fn().mockResolvedValue(makeApplication()) });

const codeOf = async (promise: Promise<unknown>): Promise<string | undefined> =>
  ((await promise.catch((e) => e)) as { code?: string }).code;

const messageOf = async (promise: Promise<unknown>): Promise<string> =>
  ((await promise.catch((e) => e)) as Error).message;

describe('per-application caps (JEF-339)', () => {
  describe('notes', () => {
    const build = (count: number) => {
      const noteRepository = makeNoteRepository({
        countByApplicationId: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockResolvedValue(makeNote()),
      });
      const useCase = new CreateNoteUseCase({
        applicationRepository: ownedApp(),
        noteRepository,
        generateId: () => 'note-1',
      });
      return { useCase, noteRepository };
    };
    const input = { userId: 'user-1', applicationId: 'app-1', content: 'hello' };

    it('creates a note one below the cap', async () => {
      const { useCase, noteRepository } = build(CONTENT_LIMITS.NOTES_PER_APPLICATION - 1);
      await useCase.execute(input);
      expect(noteRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap with QUOTA_EXCEEDED naming the limit', async () => {
      const { useCase, noteRepository } = build(CONTENT_LIMITS.NOTES_PER_APPLICATION);
      const promise = useCase.execute(input);
      expect(await codeOf(promise)).toBe('QUOTA_EXCEEDED');
      expect(await messageOf(useCase.execute(input))).toContain(
        String(CONTENT_LIMITS.NOTES_PER_APPLICATION),
      );
      expect(noteRepository.create).not.toHaveBeenCalled();
    });

    it('accepts content of exactly the maximum length', async () => {
      const { useCase } = build(0);
      await expect(
        useCase.execute({ ...input, content: 'x'.repeat(FIELD_LENGTH_LIMITS.NOTE_CONTENT) }),
      ).resolves.toBeDefined();
    });

    it('refuses over-long content with VALIDATION instead of truncating it', async () => {
      const { useCase, noteRepository } = build(0);
      const code = await codeOf(
        useCase.execute({ ...input, content: 'x'.repeat(FIELD_LENGTH_LIMITS.NOTE_CONTENT + 1) }),
      );
      expect(code).toBe('VALIDATION');
      expect(noteRepository.create).not.toHaveBeenCalled();
    });

    it('refuses an over-long edit too', async () => {
      const noteRepository = makeNoteRepository({
        findById: vi.fn().mockResolvedValue(makeNote()),
        update: vi.fn(),
      });
      const useCase = new UpdateNoteUseCase({
        applicationRepository: ownedApp(),
        noteRepository,
      });
      const code = await codeOf(
        useCase.execute({
          userId: 'user-1',
          noteId: 'note-1',
          content: 'x'.repeat(FIELD_LENGTH_LIMITS.NOTE_CONTENT + 1),
        }),
      );
      expect(code).toBe('VALIDATION');
      expect(noteRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('contacts', () => {
    const build = (count: number) => {
      const contactRepository = makeContactRepository({
        countByApplicationId: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockResolvedValue(makeContact()),
      });
      const useCase = new CreateContactUseCase({
        applicationRepository: ownedApp(),
        contactRepository,
        generateId: () => 'contact-1',
      });
      return { useCase, contactRepository };
    };
    const input = { userId: 'user-1', applicationId: 'app-1', name: 'Pat' };

    it('creates a contact one below the cap', async () => {
      const { useCase, contactRepository } = build(CONTENT_LIMITS.CONTACTS_PER_APPLICATION - 1);
      await useCase.execute(input);
      expect(contactRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap', async () => {
      const { useCase, contactRepository } = build(CONTENT_LIMITS.CONTACTS_PER_APPLICATION);
      expect(await codeOf(useCase.execute(input))).toBe('QUOTA_EXCEEDED');
      expect(contactRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('interview rounds', () => {
    const build = (count: number) => {
      const interviewRoundRepository = makeInterviewRoundRepository({
        countByApplicationId: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockResolvedValue(makeInterviewRound()),
      });
      const useCase = new CreateInterviewRoundUseCase({
        applicationRepository: ownedApp(),
        interviewRoundRepository,
        generateId: () => 'round-1',
      });
      return { useCase, interviewRoundRepository };
    };
    const input = { userId: 'user-1', applicationId: 'app-1' };

    it('creates a round one below the cap', async () => {
      const { useCase, interviewRoundRepository } = build(
        CONTENT_LIMITS.INTERVIEW_ROUNDS_PER_APPLICATION - 1,
      );
      await useCase.execute(input);
      expect(interviewRoundRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap', async () => {
      const { useCase, interviewRoundRepository } = build(
        CONTENT_LIMITS.INTERVIEW_ROUNDS_PER_APPLICATION,
      );
      expect(await codeOf(useCase.execute(input))).toBe('QUOTA_EXCEEDED');
      expect(interviewRoundRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('offers', () => {
    const build = (count: number) => {
      const offerRepository = makeOfferRepository({
        countByApplicationId: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockResolvedValue(makeOffer()),
      });
      const useCase = new CreateOfferUseCase({
        entitlementService: makeEntitlementService(),
        offerRepository,
        applicationRepository: ownedApp(),
      });
      return { useCase, offerRepository };
    };
    const input = { userId: 'user-1', applicationId: 'app-1' } as Parameters<
      CreateOfferUseCase['execute']
    >[0];

    it('creates an offer one below the cap', async () => {
      const { useCase, offerRepository } = build(CONTENT_LIMITS.OFFERS_PER_APPLICATION - 1);
      await useCase.execute(input);
      expect(offerRepository.create).toHaveBeenCalled();
    });

    it('refuses at the cap', async () => {
      const { useCase, offerRepository } = build(CONTENT_LIMITS.OFFERS_PER_APPLICATION);
      expect(await codeOf(useCase.execute(input))).toBe('QUOTA_EXCEEDED');
      expect(offerRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('document drafts', () => {
    const FULL = CONTENT_LIMITS.DOCUMENT_DRAFTS_PER_APPLICATION;
    const draftRepository = (count: number) =>
      makeDocumentDraftRepository({
        countWithTextByApplicationId: vi.fn().mockResolvedValue(count),
        create: vi.fn().mockImplementation((data) => Promise.resolve(makeDocumentDraft(data))),
      });

    it('creates a typed-in draft one below the cap', async () => {
      const documentDraftRepository = draftRepository(FULL - 1);
      const useCase = new CreateDocumentDraftUseCase({
        documentDraftRepository,
        applicationRepository: ownedApp(),
        generateId: () => 'draft-1',
      });
      await useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        type: 'cover_letter',
        title: 'Letter',
      });
      expect(documentDraftRepository.create).toHaveBeenCalled();
    });

    it('does not let blank drafts use up the cap (JEF-506)', async () => {
      const documentDraftRepository = makeDocumentDraftRepository({
        // The list shows 30 drafts, but none of them has any text yet.
        countByApplicationId: vi.fn().mockResolvedValue(FULL + 10),
        countWithTextByApplicationId: vi.fn().mockResolvedValue(0),
        create: vi.fn().mockImplementation((data) => Promise.resolve(makeDocumentDraft(data))),
      });
      const useCase = new CreateDocumentDraftUseCase({
        documentDraftRepository,
        applicationRepository: ownedApp(),
        generateId: () => 'draft-1',
      });
      await useCase.execute({
        userId: 'user-1',
        applicationId: 'app-1',
        type: 'resume',
        title: 'CV',
      });
      expect(documentDraftRepository.create).toHaveBeenCalled();
    });

    it('refuses a typed-in draft at the cap', async () => {
      const documentDraftRepository = draftRepository(FULL);
      const useCase = new CreateDocumentDraftUseCase({
        documentDraftRepository,
        applicationRepository: ownedApp(),
        generateId: () => 'draft-1',
      });
      const code = await codeOf(
        useCase.execute({
          userId: 'user-1',
          applicationId: 'app-1',
          type: 'resume',
          title: 'CV',
        }),
      );
      expect(code).toBe('QUOTA_EXCEEDED');
      expect(documentDraftRepository.create).not.toHaveBeenCalled();
    });

    it('refuses an AI resume at the cap before asking the model', async () => {
      const documentDraftRepository = draftRepository(FULL);
      const generateResumeUseCase = { execute: vi.fn() };
      const useCase = new GenerateResumeDraftUseCase({
        generateResumeUseCase,
        documentDraftRepository,
        applicationRepository: ownedApp(),
        userRepository: makeUserRepository(),
        generateId: () => 'draft-1',
        now: () => new Date('2026-11-02T00:00:00Z'),
      });
      expect(await codeOf(useCase.execute({ userId: 'user-1', applicationId: 'app-1' }))).toBe(
        'QUOTA_EXCEEDED',
      );
      expect(generateResumeUseCase.execute).not.toHaveBeenCalled();
      expect(documentDraftRepository.create).not.toHaveBeenCalled();
    });

    it('refuses an AI cover letter at the cap before asking the model', async () => {
      const documentDraftRepository = draftRepository(FULL);
      const generateCoverLetterUseCase = { execute: vi.fn() };
      const useCase = new GenerateCoverLetterDraftUseCase({
        generateCoverLetterUseCase,
        documentDraftRepository,
        applicationRepository: ownedApp(),
        documentRepository: makeDocumentRepository(),
        extractDocumentTextUseCase: { execute: vi.fn() },
        generateId: () => 'draft-1',
        now: () => new Date('2026-11-02T00:00:00Z'),
      } as unknown as ConstructorParameters<typeof GenerateCoverLetterDraftUseCase>[0]);
      expect(await codeOf(useCase.execute({ userId: 'user-1', applicationId: 'app-1' }))).toBe(
        'QUOTA_EXCEEDED',
      );
      expect(generateCoverLetterUseCase.execute).not.toHaveBeenCalled();
      expect(documentDraftRepository.create).not.toHaveBeenCalled();
    });
  });
});
