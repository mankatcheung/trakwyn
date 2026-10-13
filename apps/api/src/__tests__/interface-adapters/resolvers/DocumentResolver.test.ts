import { describe, it, expect, vi } from 'vitest';
import { DocumentResolver } from '#src/interface-adapters/resolvers/DocumentResolver.js';
import { DocumentMapper } from '#src/interface-adapters/mappers/DocumentMapper.js';
import { makeDocument, makeDocumentFileLinks } from '#src/__tests__/helpers/mocks/documents.js';
import type { IRequestUploadUrlUseCase } from '#src/use-cases/documents/IRequestUploadUrlUseCase.js';
import type { IConfirmDocumentUseCase } from '#src/use-cases/documents/IConfirmDocumentUseCase.js';
import type { IGetDocumentsUseCase } from '#src/use-cases/documents/IGetDocumentsUseCase.js';
import type { IDeleteDocumentUseCase } from '#src/use-cases/documents/IDeleteDocumentUseCase.js';

const stub = <T>(methods: Partial<T>): T => methods as T;

const makeDeps = (overrides?: object) => ({
  requestUploadUrlUseCase: stub<IRequestUploadUrlUseCase>({ execute: vi.fn() }),
  confirmDocumentUseCase: stub<IConfirmDocumentUseCase>({ execute: vi.fn() }),
  getDocumentsUseCase: stub<IGetDocumentsUseCase>({ execute: vi.fn() }),
  deleteDocumentUseCase: stub<IDeleteDocumentUseCase>({ execute: vi.fn() }),
  documentFileLinks: makeDocumentFileLinks(),
  documentMapper: new DocumentMapper(),
  ...overrides,
});

describe('DocumentResolver', () => {
  it('getDocuments: links each document to its file route and returns mapped DTOs', async () => {
    const docs = [
      makeDocument({ id: 'doc-1', storageKey: 'path/to/doc1.pdf' }),
      makeDocument({ id: 'doc-2', storageKey: 'path/to/doc2.pdf' }),
    ];
    const deps = makeDeps({
      getDocumentsUseCase: stub<IGetDocumentsUseCase>({ execute: vi.fn().mockResolvedValue(docs) }),
    });

    const resolver = new DocumentResolver(deps);
    const result = await resolver.getDocuments('user-1', 'app-1');

    expect(deps.getDocumentsUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
    });
    expect(deps.documentFileLinks.urlFor).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(2);
    expect(result[0].url).toBe('https://api.example.com/documents/doc-1/file');
    expect(result[1].url).toBe('https://api.example.com/documents/doc-2/file');
    // The storage key is an implementation detail the client never sees.
    expect(JSON.stringify(result)).not.toContain('path/to/doc1.pdf');
  });

  it('requestUploadUrl: delegates to use case and returns the payload', async () => {
    const payload = {
      uploadUrl: 'https://r2.example.com/upload',
      storageKey: 'users/user-1/applications/app-1/abc-resume.pdf',
    };
    const deps = makeDeps({
      requestUploadUrlUseCase: stub<IRequestUploadUrlUseCase>({
        execute: vi.fn().mockResolvedValue(payload),
      }),
    });

    const resolver = new DocumentResolver(deps);
    const result = await resolver.requestUploadUrl(
      'user-1',
      'app-1',
      'resume.pdf',
      'application/pdf',
    );

    expect(deps.requestUploadUrlUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      applicationId: 'app-1',
      filename: 'resume.pdf',
      mimeType: 'application/pdf',
    });
    expect(result).toEqual(payload);
  });

  it('confirmDocument: saves the record, links its file route, and returns the mapped DTO', async () => {
    const doc = makeDocument({ storageKey: 'users/user-1/applications/app-1/abc-resume.pdf' });
    const deps = makeDeps({
      confirmDocumentUseCase: stub<IConfirmDocumentUseCase>({
        execute: vi.fn().mockResolvedValue(doc),
      }),
    });

    const resolver = new DocumentResolver(deps);
    const result = await resolver.confirmDocument('user-1', {
      applicationId: 'app-1',
      storageKey: doc.storageKey,
      name: 'resume.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 12345,
    });

    expect(deps.documentFileLinks.urlFor).toHaveBeenCalledWith(doc.id);
    expect(result.url).toBe(`https://api.example.com/documents/${doc.id}/file`);
    expect(result.id).toBe(doc.id);
  });

  it('deleteDocument: calls delete use case and returns true', async () => {
    const deps = makeDeps({
      deleteDocumentUseCase: stub<IDeleteDocumentUseCase>({
        execute: vi.fn().mockResolvedValue(undefined),
      }),
    });

    const resolver = new DocumentResolver(deps);
    const result = await resolver.deleteDocument('user-1', 'doc-1');

    expect(deps.deleteDocumentUseCase.execute).toHaveBeenCalledWith({
      userId: 'user-1',
      documentId: 'doc-1',
    });
    expect(result).toBe(true);
  });
});
