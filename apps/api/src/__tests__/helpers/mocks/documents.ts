/**
 * Test doubles for the documents domain.
 *
 * One of the per-domain modules split out of the former 816-line
 * `helpers/mocks.ts` (JEF-254), which held all 68 factories together and was
 * imported by 157 test files.
 */

import { vi } from 'vitest';
import type { Document } from '#src/domain/document/Document.js';
import type { DocumentDraft } from '#src/domain/documentDraft/DocumentDraft.js';
import type { ResumeMatch } from '#src/domain/resumeMatch/ResumeMatch.js';
import type { IResumeMatchRepository } from '#src/use-cases/ports/IResumeMatchRepository.js';
import type { IDocumentDraftRepository } from '#src/use-cases/ports/IDocumentDraftRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IDocumentTextExtractor } from '#src/use-cases/ports/IDocumentTextExtractor.js';
import type { IPdfRenderer } from '#src/use-cases/ports/IPdfRenderer.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';

export const makeDocumentRepository = (
  overrides?: Partial<IDocumentRepository>,
): IDocumentRepository => ({
  findAllByApplicationId: vi.fn(),
  countByApplicationId: vi.fn().mockResolvedValue(0),
  findAllByUserId: vi.fn(),
  findById: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
  ...overrides,
});

export const makeResumeMatchRepository = (
  overrides?: Partial<IResumeMatchRepository>,
): IResumeMatchRepository => ({
  findByApplicationId: vi.fn().mockResolvedValue([]),
  upsert: vi.fn().mockImplementation((data: ResumeMatch) => Promise.resolve(data)),
  ...overrides,
});

export const makeResumeMatch = (overrides?: Partial<ResumeMatch>): ResumeMatch => ({
  id: 'match-1',
  applicationId: 'app-1',
  documentDraftId: 'draft-1',
  documentId: null,
  score: 80,
  label: 'Good match',
  matchedKeywords: ['TypeScript'],
  missingKeywords: ['Kubernetes'],
  summary: 'Solid fit.',
  generatedAt: new Date('2026-10-12T12:00:00Z'),
  resumeTextHash: 'hash',
  ...overrides,
});

export const makeDocument = (overrides?: Partial<Document>): Document => ({
  id: 'doc-1',
  applicationId: 'app-1',
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 12345,
  storageKey: 'users/user-1/applications/app-1/resume.pdf',
  documentType: 'other',
  version: null,
  sourceDraftId: null,
  createdAt: new Date('2024-01-01'),
  ...overrides,
});

export const makeDocumentDraftRepository = (
  overrides?: Partial<IDocumentDraftRepository>,
): IDocumentDraftRepository => ({
  findAllByApplicationId: vi.fn().mockResolvedValue([]),
  countByApplicationId: vi.fn().mockResolvedValue(0),
  findById: vi.fn(),
  create: vi.fn(),
  updateContent: vi.fn(),
  rename: vi.fn(),
  delete: vi.fn(),
  findRecentCoverLettersByUserExcludingApplication: vi.fn().mockResolvedValue([]),
  ...overrides,
});

export const makeDocumentDraft = (overrides?: Partial<DocumentDraft>): DocumentDraft => ({
  id: 'draft-1',
  applicationId: 'app-1',
  type: 'cover_letter',
  title: 'Cover Letter',
  contentJson: '{"type":"doc","content":[]}',
  plainText: '',
  sourceDocumentId: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

export const makePdfRenderer = (overrides?: Partial<IPdfRenderer>): IPdfRenderer => ({
  render: vi.fn().mockResolvedValue(Buffer.from('pdf-content')),
  ...overrides,
});

export const makeDocumentTextExtractor = (
  overrides?: Partial<IDocumentTextExtractor>,
): IDocumentTextExtractor => ({
  extract: vi.fn().mockResolvedValue('extracted resume text'),
  ...overrides,
});

export const makeStorageProvider = (overrides?: Partial<IStorageProvider>): IStorageProvider => ({
  getPresignedUploadUrl: vi.fn(),
  getSignedUrl: vi.fn(),
  putObject: vi.fn(),
  delete: vi.fn(),
  deleteMany: vi.fn(),
  ...overrides,
});
