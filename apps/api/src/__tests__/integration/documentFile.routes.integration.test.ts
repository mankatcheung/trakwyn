import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV, STORAGE_PROVIDER } from '#src/infrastructure/config/constants.js';
import { DOCUMENT_FILE_LINK } from '#src/use-cases/constants.js';

const REGISTER = `
  mutation Register($email: String!, $password: String!) {
    register(email: $email, password: $password)
  }
`;
const CREATE_APPLICATION = `
  mutation CreateApplication($input: CreateApplicationInput!) {
    createApplication(input: $input) { id }
  }
`;
const CONFIRM_DOCUMENT = `
  mutation ConfirmDocument($input: ConfirmDocumentInput!) {
    confirmDocument(input: $input) { id url name }
  }
`;
const DOCUMENTS = `
  query Documents($applicationId: ID!) {
    documents(applicationId: $applicationId) { id url }
  }
`;

/**
 * Documents are readable only through `GET /documents/:id/file` and the signed
 * link `Document.url` carries (JEF-51). Files land in the local provider's real
 * upload dir (`<cwd>/uploads`, gitignored) under per-run user ids.
 */
describe('document file route (JEF-51) — STORAGE_PROVIDER=local', () => {
  const uploadDir = join(process.cwd(), 'uploads');
  const pdfBytes = Buffer.from('%PDF-1.4 private resume body');
  const userIds: string[] = [];
  let testApp: TestApp;

  const graphql = (token: string, query: string, variables: Record<string, unknown>) =>
    testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      cookies: { trakwyn_access_token: token },
      payload: { query, variables },
    });

  /** Registers a user, then uploads a document the way the client does and confirms it. */
  async function uploadDocument(name = 'résumé (final).pdf') {
    const register = await testApp.app.inject({
      method: 'POST',
      url: '/graphql',
      payload: {
        query: REGISTER,
        variables: { email: `${randomUUID()}@example.com`, password: 'correct-horse-1' },
      },
    });
    const cookies = register.cookies as Array<{ name: string; value: string }>;
    const token = cookies.find((c) => c.name === 'trakwyn_access_token')!.value;

    const created = await graphql(token, CREATE_APPLICATION, {
      input: { company: 'Acme', role: 'Engineer', status: 'applied' },
    });
    const applicationId = created.json().data.createApplication.id as string;
    const userId = (
      JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as { sub: string }
    ).sub;
    userIds.push(userId);

    const storageKey = `users/${userId}/applications/${applicationId}/${randomUUID()}-resume.pdf`;
    const put = await testApp.app.inject({
      method: 'PUT',
      url: `/uploads/_upload/${encodeURIComponent(storageKey)}`,
      headers: { 'content-type': 'application/pdf' },
      payload: pdfBytes,
    });
    expect(put.statusCode).toBe(204);

    const confirmed = await graphql(token, CONFIRM_DOCUMENT, {
      input: {
        applicationId,
        storageKey,
        name,
        mimeType: 'application/pdf',
        sizeBytes: pdfBytes.byteLength,
      },
    });
    const document = confirmed.json().data.confirmDocument as { id: string; url: string };
    return { token, applicationId, storageKey, document };
  }

  /** The path and query of a document URL, so `inject` does not need its origin. */
  const pathOf = (url: string) => {
    const { pathname, search } = new URL(url);
    return `${pathname}${search}`;
  };

  beforeAll(async () => {
    process.env[ENV.STORAGE_PROVIDER] = STORAGE_PROVIDER.LOCAL;
    testApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    vi.useRealTimers();
    await testApp.cleanup();
    await Promise.all(
      userIds.map((id) => rm(join(uploadDir, 'users', id), { recursive: true, force: true })),
    );
    delete process.env[ENV.STORAGE_PROVIDER];
  });

  it('hands out a link to the file route, never the storage key or a bare /uploads URL', async () => {
    const { document, storageKey } = await uploadDocument();

    expect(new URL(document.url).pathname).toBe(`/documents/${document.id}/file`);
    expect(document.url).toContain('token=');
    expect(document.url).not.toContain(storageKey);
    expect(document.url).not.toContain('/uploads/');
  });

  it('serves the file to the link, with headers that keep the URL private', async () => {
    const { document } = await uploadDocument();

    const res = await testApp.app.inject({ method: 'GET', url: pathOf(document.url) });

    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(pdfBytes)).toBe(true);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-length']).toBe(String(pdfBytes.byteLength));
    expect(res.headers['content-disposition']).toBe(
      "inline; filename*=UTF-8''r%C3%A9sum%C3%A9%20%28final%29.pdf",
    );
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  });

  it('gives the same link shape from the documents query', async () => {
    const { token, applicationId, document } = await uploadDocument();

    const res = await graphql(token, DOCUMENTS, { applicationId });
    const [listed] = res.json().data.documents as Array<{ id: string; url: string }>;

    expect(listed!.id).toBe(document.id);
    expect(new URL(listed!.url).pathname).toBe(`/documents/${document.id}/file`);
  });

  it('refuses a request with no token', async () => {
    const { document } = await uploadDocument();

    const res = await testApp.app.inject({ method: 'GET', url: `/documents/${document.id}/file` });

    expect(res.statusCode).toBe(401);
  });

  it('refuses a token that was tampered with', async () => {
    const { document } = await uploadDocument();
    const url = new URL(document.url);
    const [expiry, signature] = url.searchParams.get('token')!.split('.');
    const forged = `${Number(expiry) + 86_400}.${signature}`;

    const res = await testApp.app.inject({
      method: 'GET',
      url: `${url.pathname}?token=${forged}`,
    });

    expect(res.statusCode).toBe(401);
  });

  it("refuses one document's token on another document", async () => {
    const mine = await uploadDocument();
    const theirs = await uploadDocument();
    const token = new URL(mine.document.url).searchParams.get('token')!;

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/documents/${theirs.document.id}/file?token=${token}`,
    });

    expect(res.statusCode).toBe(401);
    expect(res.rawPayload.equals(pdfBytes)).toBe(false);
  });

  it('refuses an expired link', async () => {
    const { document } = await uploadDocument();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() + (DOCUMENT_FILE_LINK.TTL_S + 60) * 1000);

      const res = await testApp.app.inject({ method: 'GET', url: pathOf(document.url) });

      expect(res.statusCode).toBe(401);
    } finally {
      vi.useRealTimers();
    }
  });

  it('answers 404 for a valid link to a file that is gone from storage', async () => {
    const { document, storageKey } = await uploadDocument();
    await rm(join(uploadDir, storageKey), { force: true });

    const res = await testApp.app.inject({ method: 'GET', url: pathOf(document.url) });

    expect(res.statusCode).toBe(404);
  });

  it('no longer serves a document through the unauthenticated /uploads route', async () => {
    const { storageKey } = await uploadDocument();

    const res = await testApp.app.inject({ method: 'GET', url: `/uploads/${storageKey}` });

    expect(res.statusCode).toBe(404);
    expect(res.rawPayload.equals(pdfBytes)).toBe(false);
  });
});
