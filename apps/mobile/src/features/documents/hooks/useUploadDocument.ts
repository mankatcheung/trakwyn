import { useMutation, useQueryClient } from '@tanstack/react-query';
import { gqlRequest } from '../../../graphql/client';
import { CONFIRM_DOCUMENT_MUTATION, REQUEST_UPLOAD_URL_MUTATION } from '../graphql/operations';
import { uploadFileToStorage } from '../lib/uploadFile';
import { storageUsageQueryKey } from '../../settings/hooks/useStorageUsage';
import { documentsQueryKey } from './useDocumentQueries';
import type { Document, RequestUploadUrlResult } from '../types';

export interface UploadDocumentInput {
  uri: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  documentType: string;
  version?: string;
}

export function useUploadDocument(applicationId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UploadDocumentInput): Promise<Document> => {
      const { requestUploadUrl } = await gqlRequest<{
        requestUploadUrl: RequestUploadUrlResult;
      }>(REQUEST_UPLOAD_URL_MUTATION, {
        input: {
          applicationId,
          filename: input.name,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
        },
      });

      await uploadFileToStorage(requestUploadUrl.uploadUrl, input.uri, input.mimeType);

      const { confirmDocument } = await gqlRequest<{ confirmDocument: Document }>(
        CONFIRM_DOCUMENT_MUTATION,
        {
          input: {
            applicationId,
            storageKey: requestUploadUrl.storageKey,
            name: input.name,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            documentType: input.documentType,
            ...(input.version ? { version: input.version } : {}),
          },
        },
      );
      return confirmDocument;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: storageUsageQueryKey });
      return queryClient.invalidateQueries({ queryKey: documentsQueryKey(applicationId) });
    },
  });
}
