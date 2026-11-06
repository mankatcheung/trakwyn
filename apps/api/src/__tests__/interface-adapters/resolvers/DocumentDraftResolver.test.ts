import { describe, it, expect, vi } from 'vitest';
import { DocumentDraftResolver } from '#src/interface-adapters/resolvers/DocumentDraftResolver.js';
import { DocumentDraftMapper } from '#src/interface-adapters/mappers/DocumentDraftMapper.js';
import { makeDocumentDraft } from '#src/__tests__/helpers/mocks/documents.js';

function makeResolver(overrides?: Record<string, unknown>) {
  const deps = {
    createDocumentDraftUseCase: { execute: vi.fn() },
    updateDocumentDraftContentUseCase: { execute: vi.fn() },
    renameDocumentDraftUseCase: { execute: vi.fn() },
    generateCoverLetterDraftUseCase: { execute: vi.fn() },
    generateResumeDraftUseCase: { execute: vi.fn() },
    polishDocumentDraftUseCase: { execute: vi.fn() },
    generateIntoDocumentDraftUseCase: { execute: vi.fn() },
    getDocumentDraftsUseCase: { execute: vi.fn() },
    getDocumentDraftUseCase: { execute: vi.fn() },
    deleteDocumentDraftUseCase: { execute: vi.fn() },
    extractDocumentTextUseCase: { execute: vi.fn() },
    exportDocumentDraftToPdfUseCase: { execute: vi.fn() },
    documentDraftMapper: new DocumentDraftMapper(),
    documentRepository: {},
    documentFileLinks: {},
    ...overrides,
  };
  return { resolver: new DocumentDraftResolver(deps as never), deps };
}

describe('DocumentDraftResolver (JEF-506)', () => {
  it('polishDocumentDraft passes the user and input through and returns the markdown', async () => {
    const { resolver, deps } = makeResolver();
    vi.mocked(deps.polishDocumentDraftUseCase.execute).mockResolvedValue({ markdown: '# Hi' });

    const result = await resolver.polishDocumentDraft('user-1', {
      draftId: 'draft-1',
      plainText: 'hi',
      instructions: 'shorter',
    });

    expect(result).toEqual({ markdown: '# Hi' });
    expect(deps.polishDocumentDraftUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      draftId: 'draft-1',
      plainText: 'hi',
      instructions: 'shorter',
    });
  });

  it('generateIntoDocumentDraft passes the user and input through', async () => {
    const { resolver, deps } = makeResolver();
    const out = { contentJson: '{}', plainText: 'x' };
    vi.mocked(deps.generateIntoDocumentDraftUseCase.execute).mockResolvedValue(out);

    const result = await resolver.generateIntoDocumentDraft('user-1', {
      draftId: 'draft-1',
      instructions: 'warmer',
      resumeDraftId: 'resume-1',
    });

    expect(result).toBe(out);
    expect(deps.generateIntoDocumentDraftUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      draftId: 'draft-1',
      instructions: 'warmer',
      resumeDraftId: 'resume-1',
    });
  });

  it('updateDocumentDraftContent forwards aiInstructions and maps them to the DTO', async () => {
    const { resolver, deps } = makeResolver();
    vi.mocked(deps.updateDocumentDraftContentUseCase.execute).mockResolvedValue(
      makeDocumentDraft({ aiInstructions: 'Be brief' }),
    );

    const dto = await resolver.updateDocumentDraftContent('user-1', {
      draftId: 'draft-1',
      contentJson: '{}',
      plainText: 'x',
      aiInstructions: 'Be brief',
    });

    expect(dto.aiInstructions).toBe('Be brief');
    expect(deps.updateDocumentDraftContentUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ aiInstructions: 'Be brief' }),
    );
  });
});
