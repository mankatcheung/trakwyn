import { asClass, Lifetime, type NameAndRegistrationPair } from 'awilix';

import { RequestUploadUrlUseCase } from '#src/use-cases/documents/RequestUploadUrlUseCase.js';
import { ConfirmDocumentUseCase } from '#src/use-cases/documents/ConfirmDocumentUseCase.js';
import { GetDocumentsUseCase } from '#src/use-cases/documents/GetDocumentsUseCase.js';
import { DeleteDocumentUseCase } from '#src/use-cases/documents/DeleteDocumentUseCase.js';
import { CreateDocumentDraftUseCase } from '#src/use-cases/documents/CreateDocumentDraftUseCase.js';
import { UpdateDocumentDraftContentUseCase } from '#src/use-cases/documents/UpdateDocumentDraftContentUseCase.js';
import { RenameDocumentDraftUseCase } from '#src/use-cases/documents/RenameDocumentDraftUseCase.js';
import { GenerateCoverLetterDraftUseCase } from '#src/use-cases/documents/GenerateCoverLetterDraftUseCase.js';
import { GenerateResumeDraftUseCase } from '#src/use-cases/documents/GenerateResumeDraftUseCase.js';
import { GetDocumentDraftsUseCase } from '#src/use-cases/documents/GetDocumentDraftsUseCase.js';
import { GetDocumentDraftUseCase } from '#src/use-cases/documents/GetDocumentDraftUseCase.js';
import { DeleteDocumentDraftUseCase } from '#src/use-cases/documents/DeleteDocumentDraftUseCase.js';
import { ExtractDocumentTextUseCase } from '#src/use-cases/documents/ExtractDocumentTextUseCase.js';
import { ExportDocumentDraftToPdfUseCase } from '#src/use-cases/documents/ExportDocumentDraftToPdfUseCase.js';
import { PolishDocumentDraftUseCase } from '#src/use-cases/documents/PolishDocumentDraftUseCase.js';
import { GenerateIntoDocumentDraftUseCase } from '#src/use-cases/documents/GenerateIntoDocumentDraftUseCase.js';
import { GetDocumentVersionOutcomesUseCase } from '#src/use-cases/documents/GetDocumentVersionOutcomesUseCase.js';

import type { Cradle } from '../types.js';

export const documents = {
  requestUploadUrlUseCase: asClass(RequestUploadUrlUseCase, { lifetime: Lifetime.TRANSIENT }),
  confirmDocumentUseCase: asClass(ConfirmDocumentUseCase, { lifetime: Lifetime.TRANSIENT }),
  getDocumentsUseCase: asClass(GetDocumentsUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteDocumentUseCase: asClass(DeleteDocumentUseCase, { lifetime: Lifetime.TRANSIENT }),
  createDocumentDraftUseCase: asClass(CreateDocumentDraftUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  renameDocumentDraftUseCase: asClass(RenameDocumentDraftUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  generateResumeDraftUseCase: asClass(GenerateResumeDraftUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  generateCoverLetterDraftUseCase: asClass(GenerateCoverLetterDraftUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  updateDocumentDraftContentUseCase: asClass(UpdateDocumentDraftContentUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getDocumentDraftsUseCase: asClass(GetDocumentDraftsUseCase, { lifetime: Lifetime.TRANSIENT }),
  getDocumentDraftUseCase: asClass(GetDocumentDraftUseCase, { lifetime: Lifetime.TRANSIENT }),
  deleteDocumentDraftUseCase: asClass(DeleteDocumentDraftUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  extractDocumentTextUseCase: asClass(ExtractDocumentTextUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  exportDocumentDraftToPdfUseCase: asClass(ExportDocumentDraftToPdfUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  polishDocumentDraftUseCase: asClass(PolishDocumentDraftUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  generateIntoDocumentDraftUseCase: asClass(GenerateIntoDocumentDraftUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
  getDocumentVersionOutcomesUseCase: asClass(GetDocumentVersionOutcomesUseCase, {
    lifetime: Lifetime.TRANSIENT,
  }),
} satisfies NameAndRegistrationPair<Cradle>;
