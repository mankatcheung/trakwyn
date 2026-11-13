import { describe, it, expect, vi } from 'vitest';
import { DraftHistoryResolver } from '#src/interface-adapters/resolvers/DraftHistoryResolver.js';
import { DocumentDraftMapper } from '#src/interface-adapters/mappers/DocumentDraftMapper.js';
import { DocumentDraftVersionMapper } from '#src/interface-adapters/mappers/DocumentDraftVersionMapper.js';
import { makeDocumentDraft } from '#src/__tests__/helpers/mocks/documents.js';
import { makeDocumentDraftVersion } from '#src/__tests__/helpers/mocks/draftHistory.js';

function makeResolver() {
  const deps = {
    listDraftVersionsUseCase: { execute: vi.fn() },
    getDraftVersionUseCase: { execute: vi.fn() },
    createDraftVersionUseCase: { execute: vi.fn() },
    restoreDraftVersionUseCase: { execute: vi.fn() },
    documentDraftVersionMapper: new DocumentDraftVersionMapper(),
    documentDraftMapper: new DocumentDraftMapper(),
  };
  return { resolver: new DraftHistoryResolver(deps as never), deps };
}

describe('DraftHistoryResolver (JEF-584)', () => {
  it('lists versions as DTOs with a character count', async () => {
    const { resolver, deps } = makeResolver();
    deps.listDraftVersionsUseCase.execute.mockResolvedValue([
      makeDocumentDraftVersion({ id: 'v1', plainText: 'hello', source: 'ai' }),
    ]);
    const result = await resolver.getVersions('user-1', 'draft-1');
    expect(deps.listDraftVersionsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      draftId: 'draft-1',
    });
    expect(result).toEqual([
      expect.objectContaining({
        id: 'v1',
        draftId: 'draft-1',
        source: 'ai',
        plainText: 'hello',
        characterCount: 5,
        createdAt: '2024-01-01T10:00:00.000Z',
      }),
    ]);
  });

  it('gets one version for the preview', async () => {
    const { resolver, deps } = makeResolver();
    deps.getDraftVersionUseCase.execute.mockResolvedValue(makeDocumentDraftVersion());
    const result = await resolver.getVersion('user-1', 'version-1');
    expect(deps.getDraftVersionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      versionId: 'version-1',
    });
    expect(result.plainText).toBe('old');
  });

  it('saves a version for the draft', async () => {
    const { resolver, deps } = makeResolver();
    deps.createDraftVersionUseCase.execute.mockResolvedValue(
      makeDocumentDraftVersion({ source: 'manual' }),
    );
    const result = await resolver.createVersion('user-1', 'draft-1');
    expect(deps.createDraftVersionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      draftId: 'draft-1',
    });
    expect(result.source).toBe('manual');
  });

  it('restores a version and returns the draft as a DTO', async () => {
    const { resolver, deps } = makeResolver();
    deps.restoreDraftVersionUseCase.execute.mockResolvedValue(
      makeDocumentDraft({ id: 'draft-1', plainText: 'restored' }),
    );
    const result = await resolver.restoreVersion('user-1', 'version-1');
    expect(deps.restoreDraftVersionUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      versionId: 'version-1',
    });
    expect(result).toMatchObject({ id: 'draft-1', plainText: 'restored' });
  });

  it('lets a use-case error through unchanged', async () => {
    const { resolver, deps } = makeResolver();
    const error = Object.assign(new Error('Not authorized'), { code: 'FORBIDDEN' });
    deps.getDraftVersionUseCase.execute.mockRejectedValue(error);
    await expect(resolver.getVersion('user-1', 'v')).rejects.toBe(error);
  });
});
