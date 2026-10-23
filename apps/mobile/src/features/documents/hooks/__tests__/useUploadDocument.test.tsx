import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('../../../../graphql/client', () => ({ gqlRequest: jest.fn() }));
jest.mock('../../lib/uploadFile', () => ({ uploadFileToStorage: jest.fn() }));

import { gqlRequest } from '../../../../graphql/client';
import { uploadFileToStorage } from '../../lib/uploadFile';
import { useUploadDocument } from '../useUploadDocument';
import type { Document } from '../../types';

const mockedGqlRequest = jest.mocked(gqlRequest);
const mockedUploadFileToStorage = jest.mocked(uploadFileToStorage);

const document: Document = {
  id: '1',
  applicationId: 'app-1',
  name: 'resume.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 1024,
  url: 'https://example.com/resume.pdf',
  documentType: 'resume',
  version: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useUploadDocument', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requests an upload URL, uploads the file, then confirms the document', async () => {
    mockedGqlRequest
      .mockResolvedValueOnce({
        requestUploadUrl: {
          uploadUrl: 'http://localhost:3001/uploads/_upload/foo',
          storageKey: 'users/1/applications/1/foo',
        },
      })
      .mockResolvedValueOnce({ confirmDocument: document });
    mockedUploadFileToStorage.mockResolvedValueOnce(undefined);

    const { result } = await renderHook(() => useUploadDocument('app-1'), { wrapper });

    let uploaded: Document | undefined;
    await act(async () => {
      uploaded = await result.current.mutateAsync({
        uri: 'file:///tmp/resume.pdf',
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        documentType: 'resume',
      });
    });

    expect(uploaded).toEqual(document);
    expect(mockedGqlRequest).toHaveBeenNthCalledWith(1, expect.any(String), {
      input: {
        applicationId: 'app-1',
        filename: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      },
    });
    expect(mockedUploadFileToStorage).toHaveBeenCalledWith(
      'http://localhost:3001/uploads/_upload/foo',
      'file:///tmp/resume.pdf',
      'application/pdf',
    );
    expect(mockedGqlRequest).toHaveBeenNthCalledWith(2, expect.any(String), {
      input: {
        applicationId: 'app-1',
        storageKey: 'users/1/applications/1/foo',
        name: 'resume.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
        documentType: 'resume',
      },
    });
  });

  it('does not confirm the document when the upload itself fails', async () => {
    mockedGqlRequest.mockResolvedValueOnce({
      requestUploadUrl: {
        uploadUrl: 'http://localhost:3001/uploads/_upload/foo',
        storageKey: 'key',
      },
    });
    mockedUploadFileToStorage.mockRejectedValueOnce(new Error('upload failed'));

    const { result } = await renderHook(() => useUploadDocument('app-1'), { wrapper });

    await act(async () => {
      await expect(
        result.current.mutateAsync({
          uri: 'file:///tmp/resume.pdf',
          name: 'resume.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          documentType: 'resume',
        }),
      ).rejects.toThrow('upload failed');
    });

    expect(mockedGqlRequest).toHaveBeenCalledTimes(1);
  });
});
