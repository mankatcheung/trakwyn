import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { buildTestApp, type TestApp } from './helpers/buildTestApp.js';
import { ENV, STORAGE_PROVIDER } from '#src/infrastructure/config/constants.js';

/**
 * `GET /uploads/*` serves the URLs `LocalStorageProvider.getSignedUrl` hands
 * out (JEF-343), which since JEF-51 are avatars only: a document is read
 * through `GET /documents/:id/file` (see documentFile.routes.integration.test).
 * Files land in the provider's real upload dir (`<cwd>/uploads`, gitignored)
 * under per-run ids, removed in `afterAll`.
 */
describe('local uploads route — STORAGE_PROVIDER=local', () => {
  const uploadDir = join(process.cwd(), 'uploads');
  const userId = `test-${randomUUID()}`;
  const applicationId = `test-${randomUUID()}`;
  const avatarKey = `users/${userId}/avatar/photo.png`;
  const documentKey = `users/${userId}/applications/app-1/resume.pdf`;
  const exportKey = `documents/${applicationId}/doc-1.pdf`;
  const pngBytes = Buffer.from('fake png body');
  const pdfBytes = Buffer.from('%PDF-1.4 fake pdf body');
  let testApp: TestApp;

  beforeAll(async () => {
    process.env[ENV.STORAGE_PROVIDER] = STORAGE_PROVIDER.LOCAL;
    testApp = await buildTestApp();
  }, 30_000);

  afterAll(async () => {
    await testApp.cleanup();
    await rm(join(uploadDir, 'users', userId), { recursive: true, force: true });
    await rm(join(uploadDir, 'documents', applicationId), { recursive: true, force: true });
    delete process.env[ENV.STORAGE_PROVIDER];
  });

  it('serves an avatar', async () => {
    // Written straight to disk: the local PUT route only takes document keys,
    // since the web app uploads avatars through Vercel Blob's client.
    await mkdir(join(uploadDir, 'users', userId, 'avatar'), { recursive: true });
    await writeFile(join(uploadDir, avatarKey), pngBytes);

    const res = await testApp.app.inject({ method: 'GET', url: `/uploads/${avatarKey}` });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['content-disposition']).toBe('inline');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.rawPayload.equals(pngBytes)).toBe(true);
  });

  it('does not serve an uploaded document: those go through the signed file route', async () => {
    const put = await testApp.app.inject({
      method: 'PUT',
      url: `/uploads/_upload/${encodeURIComponent(documentKey)}`,
      headers: { 'content-type': 'application/pdf' },
      payload: pdfBytes,
    });
    expect(put.statusCode).toBe(204);

    const res = await testApp.app.inject({ method: 'GET', url: `/uploads/${documentKey}` });

    expect(res.statusCode).toBe(404);
    expect(res.rawPayload.equals(pdfBytes)).toBe(false);
  });

  it('does not serve an exported PDF, whose key lives outside users/', async () => {
    await mkdir(join(uploadDir, 'documents', applicationId), { recursive: true });
    await writeFile(join(uploadDir, exportKey), pdfBytes);

    const res = await testApp.app.inject({ method: 'GET', url: `/uploads/${exportKey}` });

    expect(res.statusCode).toBe(404);
    expect(res.rawPayload.equals(pdfBytes)).toBe(false);
  });

  it('returns 404 for an avatar key with no file', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/uploads/users/${userId}/avatar/missing.png`,
    });

    expect(res.statusCode).toBe(404);
  });

  it('does not serve the upload route prefix as a stored object', async () => {
    const res = await testApp.app.inject({
      method: 'GET',
      url: `/uploads/_upload/${encodeURIComponent(avatarKey)}`,
    });

    expect(res.statusCode).toBe(404);
  });

  it.each([
    ['an encoded slash', '/uploads/users%2f..%2f..%2fpackage.json'],
    ['a backslash', '/uploads/users%5c..%5c..%5cpackage.json'],
  ])('rejects a traversal attempt using %s with 400', async (_label, url) => {
    const res = await testApp.app.inject({ method: 'GET', url });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'Invalid storage key' });
  });

  it.each([
    ['a literal ../', '/uploads/../package.json'],
    ['percent-encoded dot segments', '/uploads/%2e%2e/%2e%2e/package.json'],
  ])('never serves a file outside the upload dir via %s', async (_label, url) => {
    // URL parsing collapses whole dot segments before routing, so these never
    // reach the handler as a traversal — they must still not leak the file.
    const res = await testApp.app.inject({ method: 'GET', url });

    expect(res.statusCode).not.toBe(200);
  });
});
