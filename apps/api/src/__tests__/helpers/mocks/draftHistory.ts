import { vi } from 'vitest';
import type { IDocumentDraftVersionRepository } from '#src/use-cases/ports/IDocumentDraftVersionRepository.js';
import type { DocumentDraftVersion } from '#src/domain/documentDraft/DocumentDraftVersion.js';

export const makeDocumentDraftVersionRepository = (
  overrides?: Partial<IDocumentDraftVersionRepository>,
): IDocumentDraftVersionRepository => ({
  create: vi.fn().mockImplementation(async (data) => ({ ...data, createdAt: new Date() })),
  listByDraft: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  findLatestByDraft: vi.fn().mockResolvedValue(null),
  pruneToLimit: vi.fn().mockResolvedValue(0),
  ...overrides,
});

export const makeDocumentDraftVersion = (
  overrides?: Partial<DocumentDraftVersion>,
): DocumentDraftVersion => ({
  id: 'version-1',
  draftId: 'draft-1',
  contentJson:
    '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"old"}]}]}',
  plainText: 'old',
  source: 'autosave',
  createdAt: new Date('2024-01-01T10:00:00Z'),
  ...overrides,
});
