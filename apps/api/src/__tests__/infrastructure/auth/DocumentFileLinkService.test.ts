import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocumentFileLinkService } from '#src/infrastructure/auth/DocumentFileLinkService.js';
import { DOCUMENT_FILE_LINK } from '#src/use-cases/constants.js';
import { ENV } from '#src/infrastructure/config/constants.js';

const tokenOf = (url: string) => new URL(url).searchParams.get('token')!;

describe('DocumentFileLinkService', () => {
  const original = {
    secret: process.env[ENV.JWT_SECRET],
    origin: process.env[ENV.API_ORIGIN],
    port: process.env[ENV.PORT],
  };
  const service = new DocumentFileLinkService();

  beforeAll(() => {
    process.env[ENV.JWT_SECRET] = 'test-secret';
    delete process.env[ENV.API_ORIGIN];
    delete process.env[ENV.PORT];
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env[ENV.API_ORIGIN];
    delete process.env[ENV.PORT];
  });
  afterAll(() => {
    for (const [name, value] of [
      [ENV.JWT_SECRET, original.secret],
      [ENV.API_ORIGIN, original.origin],
      [ENV.PORT, original.port],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe('urlFor', () => {
    it('points at the document file route on the configured API origin', () => {
      process.env[ENV.API_ORIGIN] = 'https://api.trakwyn.com/';

      const url = new URL(service.urlFor('doc-1'));

      expect(url.origin).toBe('https://api.trakwyn.com');
      expect(url.pathname).toBe('/documents/doc-1/file');
      expect(url.searchParams.get('token')).toBeTruthy();
    });

    it('falls back to this server on its own port when no origin is configured', () => {
      process.env[ENV.PORT] = '4010';

      expect(service.urlFor('doc-1')).toMatch(/^http:\/\/localhost:4010\/documents\/doc-1\/file\?/);
    });

    it('escapes a document id so it cannot add path segments or query params', () => {
      const url = new URL(service.urlFor('a/../b?x=1'));

      expect(url.pathname).toBe('/documents/a%2F..%2Fb%3Fx%3D1/file');
      expect([...url.searchParams.keys()]).toEqual(['token']);
    });
  });

  describe('verify', () => {
    it('accepts the token of a link it issued for the same document', () => {
      expect(service.verify('doc-1', tokenOf(service.urlFor('doc-1')))).toBe(true);
    });

    it("rejects one document's token on another document", () => {
      expect(service.verify('doc-2', tokenOf(service.urlFor('doc-1')))).toBe(false);
    });

    it('rejects a token past its lifetime, and accepts it just before', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-13T12:00:00Z'));
      const token = tokenOf(service.urlFor('doc-1'));

      vi.setSystemTime(
        new Date('2026-10-13T12:00:00Z').getTime() + DOCUMENT_FILE_LINK.TTL_S * 1000,
      );
      expect(service.verify('doc-1', token)).toBe(true);

      vi.setSystemTime(
        new Date('2026-10-13T12:00:00Z').getTime() + (DOCUMENT_FILE_LINK.TTL_S + 1) * 1000,
      );
      expect(service.verify('doc-1', token)).toBe(false);
    });

    it('rejects a token whose expiry was extended, since the expiry is signed', () => {
      const [expiry, signature] = tokenOf(service.urlFor('doc-1')).split('.');

      expect(service.verify('doc-1', `${Number(expiry) + 86_400}.${signature}`)).toBe(false);
    });

    it('rejects a token signed under a different secret', () => {
      const token = tokenOf(service.urlFor('doc-1'));
      process.env[ENV.JWT_SECRET] = 'another-secret';
      try {
        expect(service.verify('doc-1', token)).toBe(false);
      } finally {
        process.env[ENV.JWT_SECRET] = 'test-secret';
      }
    });

    it.each([
      ['empty', ''],
      ['no signature', '1999999999'],
      ['no expiry', '.abc'],
      ['a non-numeric expiry', 'soon.abc'],
      ['an extra part', `${Math.floor(Date.now() / 1000) + 60}.abc.def`],
      ['a negative expiry', '-1.abc'],
    ])('rejects a malformed token: %s', (_label, token) => {
      expect(service.verify('doc-1', token)).toBe(false);
    });
  });
});
