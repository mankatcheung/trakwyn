import {
  ForbiddenError,
  NotFoundError,
  QuotaExceededError,
} from '#src/use-cases/errors/DomainError.js';
import { nanoid } from 'nanoid';
import { storageAccessFor } from '#src/use-cases/shared/storageAccess.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import { assertAllowedMimeType } from '#src/use-cases/documents/documentValidation.js';
import { CONTENT_LIMITS } from '#src/use-cases/constants.js';
import type {
  IRequestUploadUrlUseCase,
  RequestUploadUrlInput,
  RequestUploadUrlOutput,
} from '#src/use-cases/documents/IRequestUploadUrlUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  documentRepository: IDocumentRepository;
  storageProvider: IStorageProvider;
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
    .slice(0, 200);
}

export class RequestUploadUrlUseCase implements IRequestUploadUrlUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: RequestUploadUrlInput): Promise<RequestUploadUrlOutput> {
    assertAllowedMimeType(input.mimeType);

    const app = await this.deps.applicationRepository.findById(input.applicationId);
    if (!app) {
      throw new NotFoundError('Application not found');
    }
    if (app.userId !== input.userId) {
      throw new ForbiddenError('Forbidden');
    }

    const documentCount = await this.deps.documentRepository.countByApplicationId(
      input.applicationId,
    );
    if (documentCount >= CONTENT_LIMITS.DOCUMENTS_PER_APPLICATION) {
      throw new QuotaExceededError(
        `This application already has the maximum of ${CONTENT_LIMITS.DOCUMENTS_PER_APPLICATION} documents`,
      );
    }

    const sanitized = sanitizeFilename(input.filename);
    const storageKey = `users/${input.userId}/applications/${input.applicationId}/${nanoid()}-${sanitized}`;
    const uploadUrl = await this.deps.storageProvider.getPresignedUploadUrl(
      storageKey,
      input.mimeType,
    );

    return { uploadUrl, storageKey, access: storageAccessFor(storageKey) };
  }
}
