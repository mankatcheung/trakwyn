import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Cradle } from '#src/http/di/types.js';
import { CV_IMPORT_UPLOAD, RATE_LIMIT, ROUTES } from '#src/http/constants.js';
import { ENV } from '#src/infrastructure/config/constants.js';
import { CV_IMPORT, MIME_TYPE } from '#src/use-cases/constants.js';
import { ERROR_CODES } from '#src/use-cases/errors/errorCodes.js';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';

/**
 * JEF-461: the CV import. `POST /profile/cv-import` reads an uploaded file into
 * entries for review; `importCvProfile` saves the ones the user ticked. The
 * file must never reach storage.
 */

const REGISTER = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;
const SAVE_KEY = `
  mutation SaveLlmApiKey($provider: String!, $apiKey: String!) {
    saveLlmApiKey(provider: $provider, apiKey: $apiKey)
  }
`;
const CREATE_WORK = `
  mutation CreateWork($input: CreateWorkExperienceInput!) {
    createWorkExperience(input: $input) { id }
  }
`;
const IMPORT = `
  mutation Import($input: ImportCvProfileInput!) {
    importCvProfile(input: $input) { workExperiences educations skills }
  }
`;
const PROFILE = `
  query Profile {
    workExperiences { company title startDate endDate }
    educations { institution degree startDate endDate }
    skills { name category }
  }
`;

interface GraphQLResponse<T> {
  data: T | null;
  errors?: Array<{ message: string; extensions?: { code?: string } }>;
}

const AI_REPLY = {
  workExperiences: [
    {
      company: 'Acme Corp',
      title: 'Senior Engineer',
      location: 'Remote',
      startDate: '2020-03',
      endDate: 'Present',
      description: 'Built distributed systems.',
    },
  ],
  educations: [
    { institution: 'UC Berkeley', degree: 'B.S.', field: 'CS', startDate: '2012', endDate: '2016' },
  ],
  skills: [{ name: 'TypeScript', category: 'Language' }],
};

const CV_TEXT = 'Jane Doe\nSenior Engineer at Acme Corp since March 2020.';

const BOUNDARY = '----trakwynCvImportBoundary';

interface Part {
  name: string;
  content: Buffer | string;
  filename?: string;
  contentType?: string;
}

function multipart(parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    const disposition =
      `Content-Disposition: form-data; name="${part.name}"` +
      (part.filename === undefined ? '' : `; filename="${part.filename}"`);
    const type = part.contentType ? `\r\nContent-Type: ${part.contentType}` : '';
    chunks.push(
      Buffer.from(`--${BOUNDARY}\r\n${disposition}${type}\r\n\r\n`),
      Buffer.isBuffer(part.content) ? part.content : Buffer.from(part.content),
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

const filePart = (content: Buffer | string, contentType: string, filename = 'cv'): Part => ({
  name: CV_IMPORT_UPLOAD.FIELD_NAME,
  content,
  filename,
  contentType,
});

function stubAi(reply: unknown = AI_REPLY) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({
        choices: [{ message: { content: JSON.stringify(reply) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10 },
      }),
    text: () => Promise.resolve(''),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('CV import (JEF-461)', () => {
  let testApp: TestApp;
  let storageSpies: Array<ReturnType<typeof vi.spyOn>>;

  const gql = <T>(query: string, variables?: object, token?: string) =>
    testApp.app
      .inject({
        method: 'POST',
        url: '/graphql',
        headers: token ? { authorization: `Bearer ${token}` } : {},
        payload: { query, variables },
      })
      .then((res) => res.json() as GraphQLResponse<T>);

  async function register(): Promise<string> {
    const body = await gql<{ register: string }>(REGISTER, {
      email: `${randomUUID()}@example.com`,
      password: 'correct-horse-1',
    });
    return body.data!.register;
  }

  /** A signed-in user who has saved an AI key (the key is only stored; the model call is stubbed). */
  async function registerWithAiKey(): Promise<string> {
    const token = await register();
    const saved = await gql(SAVE_KEY, { provider: 'openai', apiKey: 'sk-test-key' }, token);
    expect(saved.errors).toBeUndefined();
    return token;
  }

  function upload(
    token: string | null,
    body: Buffer,
    headers: Record<string, string> = {},
    contentType = `multipart/form-data; boundary=${BOUNDARY}`,
  ) {
    return testApp.app.inject({
      method: 'POST',
      url: ROUTES.CV_IMPORT,
      headers: {
        'content-type': contentType,
        [CV_IMPORT_UPLOAD.REQUIRED_HEADER]: CV_IMPORT_UPLOAD.REQUIRED_HEADER_VALUE,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      payload: body,
    });
  }

  const uploadText = (token: string, text = CV_TEXT) =>
    upload(token, multipart([filePart(text, MIME_TYPE.TEXT_PLAIN, 'cv.txt')]));

  beforeAll(async () => {
    testApp = await buildTestApp();
    // The file must never be written, read back or signed: spy on every method
    // the storage provider has and assert none ran (afterEach).
    const { storageProvider } = testApp.app.diContainer.cradle as unknown as Cradle;
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(storageProvider)).filter(
      (name) =>
        name !== 'constructor' &&
        typeof (storageProvider as unknown as Record<string, unknown>)[name] === 'function',
    );
    storageSpies = names.map((name) =>
      vi.spyOn(storageProvider as unknown as Record<string, () => unknown>, name),
    );
    expect(storageSpies.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  beforeEach(() => {
    // A test that reaches the model must say so with stubAi(); anything else
    // would send a real request with a made-up key.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('unexpected network call in a CV import test')),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    const calls = storageSpies.filter((spy) => spy.mock.calls.length > 0);
    expect(calls).toEqual([]);
  });

  describe('POST /profile/cv-import', () => {
    it('reads a text CV into entries for review', async () => {
      const token = await registerWithAiKey();
      const ai = stubAi();

      const res = await uploadText(token);

      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.json()).toEqual({
        workExperiences: [
          {
            company: 'Acme Corp',
            title: 'Senior Engineer',
            location: 'Remote',
            startDate: '2020-03',
            endDate: null,
            description: 'Built distributed systems.',
            alreadyInProfile: false,
          },
        ],
        educations: [
          {
            institution: 'UC Berkeley',
            degree: 'B.S.',
            field: 'CS',
            startDate: '2012-01',
            endDate: '2016-01',
            description: null,
            alreadyInProfile: false,
          },
        ],
        skills: [
          { name: 'TypeScript', category: 'Language', proficiency: null, alreadyInProfile: false },
        ],
        truncated: false,
      });
      expect(ai).toHaveBeenCalledTimes(1);
      expect(String(ai.mock.calls[0]![1].body)).toContain('Senior Engineer at Acme Corp');
    });

    it('answers 400, not 500, for a PDF the real extractor cannot read', async () => {
      const token = await registerWithAiKey();
      stubAi();

      // Valid signature, invalid body: it passes the type checks and then the
      // extractor cannot read it, which must be a clean 400 and not a 500.
      const res = await upload(
        token,
        multipart([filePart(Buffer.from('%PDF-1.7\nnot really a pdf'), MIME_TYPE.PDF, 'cv.pdf')]),
      );

      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({
        error: expect.stringMatching(/couldn't read/i),
        code: ERROR_CODES.VALIDATION,
      });
      expect(res.body).not.toContain('not really a pdf');
    });

    it('flags what the profile already holds', async () => {
      const token = await registerWithAiKey();
      await gql(
        CREATE_WORK,
        {
          input: {
            company: 'ACME corp',
            title: 'senior engineer',
            startDate: '2020-03-10T00:00:00.000Z',
          },
        },
        token,
      );
      stubAi();

      const res = await uploadText(token);

      expect(res.json().workExperiences[0].alreadyInProfile).toBe(true);
      expect(res.json().skills[0].alreadyInProfile).toBe(false);
    });

    describe('who may call it', () => {
      it('answers 401 without a session', async () => {
        const res = await upload(null, multipart([filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN)]));
        expect(res.statusCode).toBe(401);
      });

      it('answers 403 without the upload header, so a cross-site form cannot spend the key', async () => {
        const token = await registerWithAiKey();
        const ai = stubAi();

        const res = await testApp.app.inject({
          method: 'POST',
          url: ROUTES.CV_IMPORT,
          headers: {
            'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
            authorization: `Bearer ${token}`,
          },
          payload: multipart([filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN)]),
        });

        expect(res.statusCode).toBe(403);
        expect(ai).not.toHaveBeenCalled();
      });

      it('answers 403 for a header with the wrong value', async () => {
        const token = await registerWithAiKey();
        const res = await upload(token, multipart([filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN)]), {
          [CV_IMPORT_UPLOAD.REQUIRED_HEADER]: 'yes',
        });
        expect(res.statusCode).toBe(403);
      });

      it('is not a multipart endpoint for any other route', async () => {
        const token = await registerWithAiKey();
        const send = (contentType: string) =>
          testApp.app.inject({
            method: 'POST',
            url: '/graphql',
            headers: { 'content-type': contentType, authorization: `Bearer ${token}` },
            payload: multipart([filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN)]),
          });

        const multipartRes = await send(`multipart/form-data; boundary=${BOUNDARY}`);
        const unknownRes = await send('application/x-never-heard-of-it');

        // /graphql answers a type it cannot read with a GraphQL error and no
        // data; multipart must be no different from any other unsupported type.
        const body = multipartRes.json() as GraphQLResponse<unknown>;
        expect(body.data ?? null).toBeNull();
        expect(body.errors).toBeDefined();
        expect(multipartRes.body).toBe(unknownRes.body);
      });
    });

    describe('what it accepts', () => {
      it('answers 400 with the AI-not-configured code when the user has no key', async () => {
        const token = await register();
        const ai = stubAi();

        const res = await uploadText(token);

        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe(ERROR_CODES.AI_NOT_CONFIGURED);
        expect(ai).not.toHaveBeenCalled();
      });

      it('refuses a request that is not multipart', async () => {
        const token = await registerWithAiKey();
        const res = await upload(token, Buffer.from('{"a":1}'), {}, 'application/json');
        expect(res.statusCode).toBe(400);
      });

      it('refuses a form with no file', async () => {
        const token = await registerWithAiKey();
        const res = await upload(token, multipart([]));
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/choose a file/i);
      });

      it('refuses a form with a text field before the file, without calling the model', async () => {
        const token = await registerWithAiKey();
        const ai = stubAi();
        const res = await upload(
          token,
          multipart([{ name: 'note', content: 'hi' }, filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN)]),
        );
        expect(res.statusCode, res.body).toBe(400);
        expect(ai).not.toHaveBeenCalled();
      });

      it('refuses a form with a text field after the file, without calling the model', async () => {
        const token = await registerWithAiKey();
        const ai = stubAi();
        const res = await upload(
          token,
          multipart([filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN), { name: 'note', content: 'hi' }]),
        );
        expect(res.statusCode, res.body).toBe(400);
        expect(ai).not.toHaveBeenCalled();
      });

      it('refuses two files, without calling the model', async () => {
        const token = await registerWithAiKey();
        const ai = stubAi();
        const res = await upload(
          token,
          multipart([
            filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN, 'a.txt'),
            filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN, 'b.txt'),
          ]),
        );
        expect(res.statusCode, res.body).toBe(400);
        expect(ai).not.toHaveBeenCalled();
      });

      it('names the .doc problem and the way round it', async () => {
        const token = await registerWithAiKey();
        const res = await upload(
          token,
          multipart([filePart(Buffer.from('doc'), MIME_TYPE.DOC, 'cv.doc')]),
        );
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/\.docx or PDF/);
      });

      it.each([MIME_TYPE.PNG, 'application/zip', 'text/html', 'application/octet-stream'])(
        'refuses %s',
        async (type) => {
          const token = await registerWithAiKey();
          const res = await upload(token, multipart([filePart('x', type)]));
          expect(res.statusCode).toBe(400);
        },
      );

      it('refuses a program declared as a PDF', async () => {
        const token = await registerWithAiKey();
        const ai = stubAi();
        const res = await upload(
          token,
          multipart([
            filePart(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(64)]), MIME_TYPE.PDF),
          ]),
        );
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/doesn't match/);
        expect(ai).not.toHaveBeenCalled();
      });

      it('refuses an empty file', async () => {
        const token = await registerWithAiKey();
        const res = await upload(token, multipart([filePart('', MIME_TYPE.TEXT_PLAIN)]));
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toMatch(/empty/i);
      });

      it('accepts a file of exactly the size limit', async () => {
        const token = await registerWithAiKey();
        stubAi();
        const res = await uploadText(token, 'a'.repeat(CV_IMPORT.MAX_BYTES));
        expect(res.statusCode).toBe(200);
        expect(res.json().truncated).toBe(true);
      });

      it('answers 413 for a file one byte over the limit', async () => {
        const token = await registerWithAiKey();
        const ai = stubAi();
        const res = await uploadText(token, 'a'.repeat(CV_IMPORT.MAX_BYTES + 1));
        expect(res.statusCode).toBe(413);
        expect(res.json().error).toMatch(/10 MB/);
        expect(ai).not.toHaveBeenCalled();
      });
    });

    describe('what a bad model reply does', () => {
      it('answers with the AI response code when the model does not return JSON', async () => {
        const token = await registerWithAiKey();
        stubAi('I am sorry, I cannot do that');
        // stubAi JSON-encodes the reply, so a string is a JSON string, not an object.
        const res = await uploadText(token);
        expect(res.statusCode).toBe(502);
        expect(res.json().code).toBe(ERROR_CODES.AI_RESPONSE_INVALID);
        expect(res.body).not.toContain('Jane Doe');
      });

      it('passes the provider failing through as an AI provider error', async () => {
        const token = await registerWithAiKey();
        vi.stubGlobal(
          'fetch',
          vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            text: () => Promise.resolve('{"error":"bad key"}'),
            headers: new Headers(),
          }),
        );
        const res = await uploadText(token);
        expect(res.statusCode).toBeGreaterThanOrEqual(400);
        expect(res.json().code).toBe(ERROR_CODES.AI_PROVIDER_ERROR);
      });
    });

    it('is rate limited per user', async () => {
      const token = await registerWithAiKey();
      stubAi();

      for (let i = 0; i < RATE_LIMIT.PARSE_CV.MAX_ATTEMPTS; i++) {
        expect((await uploadText(token)).statusCode).toBe(200);
      }
      const limited = await uploadText(token);

      expect(limited.statusCode).toBe(429);
      expect(limited.json().code).toBe(ERROR_CODES.RATE_LIMITED);
    });

    it("does not spend one user's budget on another's", async () => {
      const a = await registerWithAiKey();
      const b = await registerWithAiKey();
      stubAi();
      for (let i = 0; i < RATE_LIMIT.PARSE_CV.MAX_ATTEMPTS; i++) await uploadText(a);

      expect((await uploadText(a)).statusCode).toBe(429);
      expect((await uploadText(b)).statusCode).toBe(200);
    });

    it('does not use up the budget on a refused file', async () => {
      const token = await registerWithAiKey();
      stubAi();
      for (let i = 0; i < RATE_LIMIT.PARSE_CV.MAX_ATTEMPTS + 2; i++) {
        await upload(token, multipart([filePart('x', MIME_TYPE.PNG)]));
      }
      expect((await uploadText(token)).statusCode).toBe(200);
    });
  });

  describe('review, then importCvProfile', () => {
    it('saves exactly what the user ticked and edited, and the profile shows it', async () => {
      const token = await registerWithAiKey();
      stubAi();
      const parsed = (await uploadText(token)).json();

      // The user drops the education, edits a title and keeps the rest.
      const imported = await gql<{ importCvProfile: Record<string, number> }>(
        IMPORT,
        {
          input: {
            workExperiences: [
              {
                company: parsed.workExperiences[0].company,
                title: 'Staff Engineer',
                location: parsed.workExperiences[0].location,
                startDate: parsed.workExperiences[0].startDate,
                endDate: parsed.workExperiences[0].endDate,
                description: parsed.workExperiences[0].description,
              },
            ],
            educations: [],
            skills: [{ name: 'TypeScript', category: 'Language' }],
          },
        },
        token,
      );

      expect(imported.errors).toBeUndefined();
      expect(imported.data!.importCvProfile).toEqual({
        workExperiences: 1,
        educations: 0,
        skills: 1,
      });

      const profile = await gql<{
        workExperiences: Array<{
          company: string;
          title: string;
          startDate: string;
          endDate: string | null;
        }>;
        educations: unknown[];
        skills: Array<{ name: string }>;
      }>(PROFILE, undefined, token);
      expect(profile.data!.workExperiences).toEqual([
        expect.objectContaining({
          company: 'Acme Corp',
          title: 'Staff Engineer',
          startDate: '2020-03-01T00:00:00.000Z',
          endDate: null,
        }),
      ]);
      expect(profile.data!.educations).toEqual([]);
      expect(profile.data!.skills.map((s) => s.name)).toEqual(['TypeScript']);
    });

    it('flags the entries as already there once imported', async () => {
      const token = await registerWithAiKey();
      stubAi();
      const first = (await uploadText(token)).json();
      await gql(
        IMPORT,
        {
          input: {
            workExperiences: [
              {
                company: first.workExperiences[0].company,
                title: first.workExperiences[0].title,
                startDate: first.workExperiences[0].startDate,
              },
            ],
            educations: [],
            skills: [{ name: 'TypeScript' }],
          },
        },
        token,
      );

      const second = (await uploadText(token)).json();

      expect(second.workExperiences[0].alreadyInProfile).toBe(true);
      expect(second.skills[0].alreadyInProfile).toBe(true);
      expect(second.educations[0].alreadyInProfile).toBe(false);
    });

    it('saves nothing when one entry is invalid', async () => {
      const token = await register();

      const refused = await gql(
        IMPORT,
        {
          input: {
            workExperiences: [
              { company: 'Acme', title: 'Dev', startDate: '2020-06', endDate: '2019-01' },
            ],
            educations: [],
            skills: [{ name: 'Go' }],
          },
        },
        token,
      );
      const profile = await gql<{ workExperiences: unknown[]; skills: unknown[] }>(
        PROFILE,
        undefined,
        token,
      );

      expect(refused.errors![0]!.extensions!.code).toBe(ERROR_CODES.VALIDATION);
      expect(profile.data!.workExperiences).toEqual([]);
      expect(profile.data!.skills).toEqual([]);
    });

    it('refuses an unreadable date', async () => {
      const token = await register();
      const refused = await gql(
        IMPORT,
        {
          input: {
            workExperiences: [{ company: 'Acme', title: 'Dev', startDate: 'last spring' }],
            educations: [],
            skills: [],
          },
        },
        token,
      );
      expect(refused.errors![0]!.extensions!.code).toBe(ERROR_CODES.VALIDATION);
    });

    it('refuses an empty selection', async () => {
      const token = await register();
      const refused = await gql(
        IMPORT,
        { input: { workExperiences: [], educations: [], skills: [] } },
        token,
      );
      expect(refused.errors![0]!.extensions!.code).toBe(ERROR_CODES.VALIDATION);
    });

    it('needs a session', async () => {
      const refused = await gql(IMPORT, {
        input: { workExperiences: [], educations: [], skills: [{ name: 'Go' }] },
      });
      expect(refused.errors![0]!.extensions!.code).toBe(ERROR_CODES.UNAUTHORIZED);
    });

    it("writes only to the caller's own profile", async () => {
      const owner = await register();
      const other = await register();
      await gql(
        IMPORT,
        { input: { workExperiences: [], educations: [], skills: [{ name: 'Rust' }] } },
        owner,
      );

      const profile = await gql<{ skills: unknown[] }>(PROFILE, undefined, other);
      expect(profile.data!.skills).toEqual([]);
    });
  });
});

describe('CV import behind the email verification wall (JEF-461)', () => {
  let testApp: TestApp;

  beforeAll(async () => {
    process.env[ENV.AUTO_VERIFY_EMAIL] = 'false';
    testApp = await buildTestApp();
    const { emailService } = testApp.app.diContainer.cradle as unknown as Cradle;
    vi.spyOn(emailService, 'sendEmailVerification').mockResolvedValue(undefined);
  });

  afterAll(async () => {
    delete process.env[ENV.AUTO_VERIFY_EMAIL];
    await testApp.cleanup();
  });

  async function unverifiedToken(): Promise<string> {
    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER,
        variables: { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
      },
    });
    return (res.json() as { data: { register: string } }).data.register;
  }

  it('refuses the upload route with EMAIL_NOT_VERIFIED', async () => {
    const token = await unverifiedToken();
    const ai = vi.fn();
    vi.stubGlobal('fetch', ai);

    const res = await testApp.app.inject({
      method: 'POST',
      url: ROUTES.CV_IMPORT,
      headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        authorization: `Bearer ${token}`,
        [CV_IMPORT_UPLOAD.REQUIRED_HEADER]: CV_IMPORT_UPLOAD.REQUIRED_HEADER_VALUE,
      },
      payload: multipart([filePart(CV_TEXT, MIME_TYPE.TEXT_PLAIN)]),
    });
    vi.unstubAllGlobals();

    expect(res.statusCode).toBe(403);
    expect(res.json().code).toBe(ERROR_CODES.EMAIL_NOT_VERIFIED);
    expect(ai).not.toHaveBeenCalled();
  });

  it('refuses the importCvProfile mutation with EMAIL_NOT_VERIFIED', async () => {
    const token = await unverifiedToken();

    const res = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        query: IMPORT,
        variables: { input: { workExperiences: [], educations: [], skills: [{ name: 'Go' }] } },
      },
    });

    expect((res.json() as GraphQLResponse<unknown>).errors![0]!.extensions!.code).toBe(
      ERROR_CODES.EMAIL_NOT_VERIFIED,
    );
  });
});
