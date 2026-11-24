/**
 * Response headers for the web app (JEF-685).
 *
 * A pure function, so a test can hold the policy: the CSP hashes must equal
 * the sha256 of the two inline head scripts, or an edit to one would silently
 * break the page. `vite.config.ts` applies the result as nitro `routeRules`.
 *
 * Imports nothing from `#/`, because a config file cannot resolve the alias.
 */
import { createHash } from 'node:crypto';
import { LOCALE_INIT_SCRIPT, THEME_INIT_SCRIPT } from '../lib/initScripts';

export type HeaderMap = Readonly<Record<string, string>>;
export type SecurityHeaderRules = Readonly<Record<string, HeaderMap>>;

export interface SecurityHeadersOptions {
  /** Origin of the API (`https://api.trakwyn.com`), or '' when it is proxied on the web origin. */
  apiOrigin: string;
  /** PostHog ingestion host, e.g. `https://eu.i.posthog.com`. */
  posthogHost: string;
}

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
/** Vercel Blob serves the signed document and avatar URLs. */
const BLOB_ORIGIN = 'https://*.blob.vercel-storage.com';

/** A CSP source expression for an inline script: `'sha256-<base64>'`. */
export function cspHash(script: string): string {
  return `'sha256-${createHash('sha256').update(script).digest('base64')}'`;
}

function contentSecurityPolicyReportOnly({
  apiOrigin,
  posthogHost,
}: SecurityHeadersOptions): string {
  const apiSources = apiOrigin ? [apiOrigin] : [];
  const directives: Array<[string, string[]]> = [
    ['default-src', ["'self'"]],
    // JSON-LD blocks are data and need no hash.
    [
      'script-src',
      ["'self'", cspHash(THEME_INIT_SCRIPT), cspHash(LOCALE_INIT_SCRIPT), TURNSTILE_ORIGIN],
    ],
    // Tailwind and component libraries set inline styles.
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', BLOB_ORIGIN]],
    ['font-src', ["'self'", 'data:']],
    ['connect-src', ["'self'", ...apiSources, posthogHost, BLOB_ORIGIN]],
    // Turnstile renders its challenge in a frame; nothing else is framed.
    ['frame-src', [TURNSTILE_ORIGIN]],
    ['worker-src', ["'self'"]],
    ['object-src', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['form-action', ["'self'", ...apiSources]],
    ['frame-ancestors', ["'none'"]],
  ];
  return directives.map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ');
}

export function securityHeaders(options: SecurityHeadersOptions): SecurityHeaderRules {
  return {
    '/**': {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'X-Frame-Options': 'DENY',
      // Enforced now: the app embeds nothing of its own (no iframe, object or
      // embed in apps/web/src). The rest of the policy is report-only until a
      // week of real traffic shows no violation, then it moves up here.
      'Content-Security-Policy': "frame-ancestors 'none'",
      'Content-Security-Policy-Report-Only': contentSecurityPolicyReportOnly(options),
    },
    // The share token is in the query string, so it must not leave in a Referer.
    '/share': { 'Referrer-Policy': 'no-referrer' },
  };
}
