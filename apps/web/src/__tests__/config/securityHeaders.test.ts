import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { LOCALE_INIT_SCRIPT, THEME_INIT_SCRIPT } from '#/lib/initScripts';
import { cspHash, securityHeaders } from '#/server/securityHeaders';

const options = {
  apiOrigin: 'https://api.trakwyn.com',
  posthogHost: 'https://eu.i.posthog.com',
};

describe('securityHeaders (JEF-685)', () => {
  const rules = securityHeaders(options);

  it('sends the baseline headers on every route', () => {
    const all = rules['/**'];
    expect(all['X-Content-Type-Options']).toBe('nosniff');
    expect(all['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(all['X-Frame-Options']).toBe('DENY');
    expect(all['Permissions-Policy']).toMatch(/camera=\(\)/);
    expect(all['Permissions-Policy']).toMatch(/microphone=\(\)/);
    expect(all['Permissions-Policy']).toMatch(/geolocation=\(\)/);
  });

  it('enforces frame-ancestors and keeps the rest of the CSP report-only', () => {
    const all = rules['/**'];
    expect(all['Content-Security-Policy']).toBe("frame-ancestors 'none'");
    expect(all['Content-Security-Policy-Report-Only']).toContain("default-src 'self'");
    expect(all['Content-Security-Policy-Report-Only']).toContain("object-src 'none'");
    expect(all['Content-Security-Policy-Report-Only']).toContain("base-uri 'self'");
    expect(all['Content-Security-Policy-Report-Only']).toContain("worker-src 'self'");
  });

  it('hashes exactly the two inline scripts', () => {
    const csp = rules['/**']['Content-Security-Policy-Report-Only'];
    for (const script of [THEME_INIT_SCRIPT, LOCALE_INIT_SCRIPT]) {
      const sha = createHash('sha256').update(script).digest('base64');
      expect(csp).toContain(`'sha256-${sha}'`);
      expect(cspHash(script)).toBe(`'sha256-${sha}'`);
    }
    expect(csp.match(/'sha256-/g)).toHaveLength(2);
  });

  it('allows the API, PostHog, Turnstile and the Blob host, and nothing unsafe', () => {
    const csp = rules['/**']['Content-Security-Policy-Report-Only'];
    expect(csp).toContain('https://api.trakwyn.com');
    expect(csp).toContain('https://eu.i.posthog.com');
    expect(csp).toContain('https://challenges.cloudflare.com');
    expect(csp).toContain('https://*.blob.vercel-storage.com');
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it('sends no referrer from /share, whose token is in the query string', () => {
    expect(rules['/share']['Referrer-Policy']).toBe('no-referrer');
  });

  it('adds no extra origin when the API is same-origin (dev proxy)', () => {
    const dev = securityHeaders({ ...options, apiOrigin: '' });
    expect(dev['/**']['Content-Security-Policy-Report-Only']).not.toContain('api.trakwyn.com');
  });
});
