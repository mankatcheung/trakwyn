import '../../../../i18n';

const mockUploadAsync = jest.fn();

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri: string) => ({ uri })),
  UploadTask: jest.fn().mockImplementation(() => ({ uploadAsync: mockUploadAsync })),
  UploadType: { BINARY_CONTENT: 0, MULTIPART: 1 },
}));

import { UploadTask } from 'expo-file-system';
import { uploadFileToStorage } from '../uploadFile';

const mockedUploadTask = jest.mocked(UploadTask);

describe('uploadFileToStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('PUTs the file to a local /_upload/ URL and succeeds on a 2xx status', async () => {
    mockUploadAsync.mockResolvedValueOnce({ status: 200, body: '', headers: {} });

    await uploadFileToStorage(
      'http://localhost:3001/uploads/_upload/foo',
      'file:///tmp/resume.pdf',
      'application/pdf',
    );

    expect(mockedUploadTask).toHaveBeenCalledWith(
      { uri: 'file:///tmp/resume.pdf' },
      'http://localhost:3001/uploads/_upload/foo',
      expect.objectContaining({
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'application/pdf' },
      }),
    );
  });

  it('throws when the local upload responds with an error status', async () => {
    mockUploadAsync.mockResolvedValueOnce({ status: 500, body: '', headers: {} });

    await expect(
      uploadFileToStorage(
        'http://localhost:3001/uploads/_upload/foo',
        'file:///tmp/resume.pdf',
        'application/pdf',
      ),
    ).rejects.toThrow('Upload failed with status 500');
  });

  it('rejects with a clear message for non-local (Vercel Blob) upload URLs', async () => {
    await expect(
      uploadFileToStorage('blob-client-token', 'file:///tmp/resume.pdf', 'application/pdf'),
    ).rejects.toThrow('not supported yet');
    expect(mockUploadAsync).not.toHaveBeenCalled();
  });
});
