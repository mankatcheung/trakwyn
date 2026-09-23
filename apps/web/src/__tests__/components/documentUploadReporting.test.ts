import { describe, expect, it, vi } from 'vitest';

const { mockCaptureException } = vi.hoisted(() => ({ mockCaptureException: vi.fn() }));
vi.mock('#/lib/analytics', () => ({ captureException: mockCaptureException }));

import {
  reportStorageFailure,
  sizeBucket,
  uploadProviderOf,
} from '#/routes/_authenticated/applications/$applicationId/-components/documentUploadReporting';

const MB = 1024 * 1024;

describe('uploadProviderOf', () => {
  it('recognises the local provider by its own upload route', () => {
    expect(uploadProviderOf('http://localhost:3001/uploads/_upload/users/u1/key')).toBe('local');
  });

  it('treats anything else as a Vercel Blob client token', () => {
    expect(uploadProviderOf('vercel_blob_client_abc123')).toBe('blob');
  });
});

describe('sizeBucket', () => {
  it.each([
    [0, '<1MB'],
    [MB - 1, '<1MB'],
    [MB, '1-10MB'],
    [10 * MB, '1-10MB'],
    [10 * MB + 1, '>10MB'],
  ])('puts %i bytes in %s', (bytes, bucket) => {
    expect(sizeBucket(bytes)).toBe(bucket);
  });
});

describe('reportStorageFailure', () => {
  it('sends the provider, MIME type and size bucket, and nothing that names the file', () => {
    const error = new Error('Failed to fetch');
    reportStorageFailure(error, {
      provider: 'blob',
      file: new File(['x'.repeat(2 * MB)], 'Acme offer.pdf', { type: 'application/pdf' }),
    });

    expect(mockCaptureException).toHaveBeenCalledWith(error, {
      kind: 'document_upload_failed',
      stage: 'storage',
      provider: 'blob',
      mime_type: 'application/pdf',
      size_bucket: '1-10MB',
    });
  });

  it('says "unknown" when the browser could not tell the MIME type', () => {
    reportStorageFailure(new Error('x'), { provider: 'local', file: { type: '', size: 1 } });

    expect(mockCaptureException).toHaveBeenLastCalledWith(
      expect.any(Error),
      expect.objectContaining({ mime_type: 'unknown' }),
    );
  });
});
