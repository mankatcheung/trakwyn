import {
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '#src/use-cases/errors/DomainError.js';
import type { IApplicationRepository } from '#src/use-cases/ports/IApplicationRepository.js';
import type { IDocumentRepository } from '#src/use-cases/ports/IDocumentRepository.js';
import type { IActivityLogRepository } from '#src/use-cases/ports/IActivityLogRepository.js';
import type { IStorageProvider } from '#src/use-cases/ports/IStorageProvider.js';
import type { IEntitlementService } from '#src/use-cases/ports/IEntitlementService.js';
import {
  assertAllowedMimeType,
  assertValidSizeBytes,
} from '#src/use-cases/documents/documentValidation.js';
import type {
  IConfirmDocumentUseCase,
  ConfirmDocumentInput,
  ConfirmDocumentOutput,
} from '#src/use-cases/documents/IConfirmDocumentUseCase.js';

interface Deps {
  applicationRepository: IApplicationRepository;
  documentRepository: IDocumentRepository;
  entitlementService: IEntitlementService;
  activityLogRepository?: IActivityLogRepository;
  storageProvider?: IStorageProvider;
  generateId: () => string;
}

function isOwnedUploadKey(storageKey: string, userId: string, applicationId: string): boolean {
  const prefix = `users/${userId}/applications/${applicationId}/`;
  return storageKey.startsWith(prefix) && !storageKey.includes('..');
}

export class ConfirmDocumentUseCase implements IConfirmDocumentUseCase {
  constructor(private readonly deps: Deps) {}

  async execute(input: ConfirmDocumentInput): Promise<ConfirmDocumentOutput> {
    let doc: ConfirmDocumentOutput;
    try {
      assertAllowedMimeType(input.mimeType);
      assertValidSizeBytes(input.sizeBytes);

      const app = await this.deps.applicationRepository.findById(input.applicationId);
      if (!app) {
        throw new NotFoundError('Application not found');
      }
      if (app.userId !== input.userId) {
        throw new ForbiddenError('Forbidden');
      }

      // The client says how big the file is, but only storage knows. A client
      // that under-reports would otherwise slip past the storage limit.
      if (this.deps.storageProvider) {
        const stored = await this.deps.storageProvider.headObject(input.storageKey);
        if (!stored) {
          throw new ValidationError('The uploaded file was not found');
        }
        if (stored.size !== input.sizeBytes) {
          throw new ValidationError('The uploaded file size does not match the reported size');
        }
      }

      const { limits } = await this.deps.entitlementService.forUserId(input.userId);

      doc = await this.deps.documentRepository.create({
        id: this.deps.generateId(),
        applicationId: input.applicationId,
        storageKey: input.storageKey,
        name: input.name,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        documentType: input.documentType,
        version: input.version,
        storageLimitBytes: limits.documentBytes,
      });
    } catch (error) {
      // The client uploads directly to storage before this database step. Do
      // not leave an orphaned blob when the quota or another write fails.
      try {
        if (isOwnedUploadKey(input.storageKey, input.userId, input.applicationId)) {
          await this.deps.storageProvider?.delete(input.storageKey);
        }
      } catch {
        // Preserve the original database/quota error for the client.
      }
      throw error;
    }

    await this.deps.activityLogRepository?.append({
      id: this.deps.generateId(),
      applicationId: input.applicationId,
      actorId: input.userId,
      eventType: 'document_uploaded',
      payload: JSON.stringify({ documentId: doc.id, name: doc.name }),
    });

    return doc;
  }
}
