import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGqlRequest } = vi.hoisted(() => ({ mockGqlRequest: vi.fn() }));

vi.mock('#/graphql/client', () => ({
  CV_IMPORT_URL: 'https://api.example.test/profile/cv-import',
  gqlClient: { request: mockGqlRequest },
  traceHeaders: () => ({ traceparent: '00-abc-def-01' }),
}));

import {
  CV_IMPORT_ACCEPT,
  CV_IMPORT_MAX_BYTES,
  CvImportError,
  resolveCvMimeType,
  uploadCv,
  validateCvFile,
  type ParsedCvProfile,
} from '#/lib/cvImport';

const PDF = 'application/pdf';
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const meta = (name: string, type: string, size = 1000) => ({ name, type, size });

describe('validateCvFile', () => {
  it.each([
    ['cv.pdf', PDF],
    ['cv.docx', DOCX],
    ['cv.txt', 'text/plain'],
  ])('accepts %s', (name, type) => {
    expect(validateCvFile(meta(name, type))).toBeNull();
  });

  it('accepts a .docx the system reports with no type', () => {
    expect(validateCvFile(meta('Jane Doe CV.docx', ''))).toBeNull();
  });

  it('accepts a .txt the system reports as a generic binary', () => {
    expect(validateCvFile(meta('cv.TXT', 'application/octet-stream'))).toBeNull();
  });

  it('names legacy .doc by type or by extension', () => {
    expect(validateCvFile(meta('cv.doc', 'application/msword'))).toBe('doc');
    expect(validateCvFile(meta('cv.doc', ''))).toBe('doc');
  });

  it.each([
    ['photo.png', 'image/png'],
    ['page.html', 'text/html'],
    ['archive.zip', 'application/zip'],
    ['noextension', ''],
    ['cv.pdf.exe', 'application/octet-stream'],
  ])('refuses %s', (name, type) => {
    expect(validateCvFile(meta(name, type))).toBe('unsupported');
  });

  it('refuses an empty file', () => {
    expect(validateCvFile(meta('cv.pdf', PDF, 0))).toBe('empty');
  });

  it('accepts a file of exactly the limit and refuses one byte over', () => {
    expect(validateCvFile(meta('cv.pdf', PDF, CV_IMPORT_MAX_BYTES))).toBeNull();
    expect(validateCvFile(meta('cv.pdf', PDF, CV_IMPORT_MAX_BYTES + 1))).toBe('tooLarge');
  });

  it('judges the type before the size, as the API does', () => {
    expect(validateCvFile(meta('cv.doc', '', CV_IMPORT_MAX_BYTES + 1))).toBe('doc');
  });
});

describe('resolveCvMimeType', () => {
  it('keeps a type the API reads', () => {
    expect(resolveCvMimeType(meta('cv.pdf', PDF))).toBe(PDF);
  });

  it('falls back to the extension when the type is missing or generic', () => {
    expect(resolveCvMimeType(meta('cv.docx', ''))).toBe(DOCX);
    expect(resolveCvMimeType(meta('cv.txt', 'application/octet-stream'))).toBe('text/plain');
  });

  it('is null for anything else', () => {
    expect(resolveCvMimeType(meta('cv.rtf', 'application/rtf'))).toBeNull();
  });
});

describe('CV_IMPORT_ACCEPT', () => {
  it('lists extensions as well as types, so a missing type does not hide a file', () => {
    expect(CV_IMPORT_ACCEPT.split(',')).toEqual(
      expect.arrayContaining(['.pdf', '.docx', '.txt', PDF, DOCX, 'text/plain']),
    );
  });

  it('does not offer .doc', () => {
    const offered = CV_IMPORT_ACCEPT.split(',');
    expect(offered).not.toContain('.doc');
    expect(offered).not.toContain('application/msword');
  });
});

describe('uploadCv', () => {
  const parsed: ParsedCvProfile = {
    workExperiences: [],
    educations: [],
    skills: [{ name: 'Go', category: null, proficiency: null, alreadyInProfile: false }],
    truncated: false,
  };
  const ok = () => new Response(JSON.stringify(parsed), { status: 200 });
  const failure = (status: number, body: unknown) =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  const file = (name = 'cv.pdf', type = PDF) => new File(['%PDF-1.7 body'], name, { type });

  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockGqlRequest.mockReset().mockResolvedValue({ me: { id: 'u1' } });
    fetchMock = vi.fn().mockImplementation(async () => ok());
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns what the API read', async () => {
    await expect(uploadCv(file())).resolves.toEqual(parsed);
  });

  it('posts a form to the import URL with the session and the upload header', async () => {
    await uploadCv(file());

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://api.example.test/profile/cv-import');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.headers).toEqual({
      'x-trakwyn-upload': 'cv-import',
      traceparent: '00-abc-def-01',
    });
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('leaves the Content-Type to the browser, which adds the multipart boundary', async () => {
    await uploadCv(file());
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
  });

  it('sends the file under its own name with a type the API reads', async () => {
    await uploadCv(file('Jane CV.docx', ''));

    const sent = (fetchMock.mock.calls[0]![1].body as FormData).get('file') as File;
    expect(sent.name).toBe('Jane CV.docx');
    expect(sent.type).toBe(DOCX);
    expect(sent.size).toBe(file().size);
  });

  it('passes the abort signal to the request', async () => {
    const controller = new AbortController();
    await uploadCv(file(), controller.signal);
    expect(fetchMock.mock.calls[0]![1].signal).toBe(controller.signal);
  });

  it('refuses a file it has no type for without sending anything', async () => {
    await expect(uploadCv(file('cv.rtf', 'application/rtf'))).rejects.toBeInstanceOf(CvImportError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  describe('an expired session', () => {
    it('refreshes it through a GraphQL call and retries once', async () => {
      fetchMock
        .mockResolvedValueOnce(failure(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' }))
        .mockResolvedValueOnce(ok());

      await expect(uploadCv(file())).resolves.toEqual(parsed);

      expect(mockGqlRequest).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('gives up when the retry is refused too', async () => {
      fetchMock.mockImplementation(async () =>
        failure(401, { error: 'Unauthorized', code: 'UNAUTHORIZED' }),
      );

      await expect(uploadCv(file())).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('stops when the refresh itself fails, as it has already signed the user out', async () => {
      fetchMock.mockResolvedValueOnce(failure(401, { error: 'Unauthorized' }));
      mockGqlRequest.mockRejectedValue(new Error('refresh rejected'));

      await expect(uploadCv(file())).rejects.toThrow('refresh rejected');
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('does not refresh for any other failure', async () => {
      fetchMock.mockResolvedValueOnce(failure(400, { error: 'x', code: 'VALIDATION' }));
      await uploadCv(file()).catch(() => undefined);
      expect(mockGqlRequest).not.toHaveBeenCalled();
    });
  });

  describe('a refusal from the API', () => {
    it.each([
      [400, "Old Word .doc files aren't supported.", 'VALIDATION'],
      [413, 'The file is larger than 10 MB', 'VALIDATION'],
      [400, 'Add your AI API key in Settings to use this feature', 'AI_NOT_CONFIGURED'],
      [429, 'Too many requests — please wait a moment and try again', 'RATE_LIMITED'],
      [502, "The AI's response couldn't be understood — please try again", 'AI_RESPONSE_INVALID'],
      [403, 'Verify your email address to continue', 'EMAIL_NOT_VERIFIED'],
    ])("carries the API's status %i message and code", async (status, error, code) => {
      fetchMock.mockResolvedValueOnce(failure(status, { error, code }));
      await expect(uploadCv(file())).rejects.toMatchObject({
        name: 'CvImportError',
        message: error,
        code,
      });
    });

    it("is an internal error with no message when the body is not the API's", async () => {
      fetchMock.mockResolvedValueOnce(failure(502, '<html>Bad gateway</html>'));
      await expect(uploadCv(file())).rejects.toMatchObject({
        message: '',
        code: 'INTERNAL_ERROR',
      });
    });
  });

  it('lets a network failure through untouched', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(uploadCv(file())).rejects.toBeInstanceOf(TypeError);
  });
});
