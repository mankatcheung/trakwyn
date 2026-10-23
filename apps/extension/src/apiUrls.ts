/**
 * The API and web app the Clipper talks to. Only the local dev servers' URLs
 * live here: a build gets the production API from `VITE_API_URL` and the web
 * app from `VITE_WEB_URL`, set where it is built (the release workflow's
 * `CLIPPER_API_URL` and `CLIPPER_WEB_URL` variables), so no deployed URL is in
 * the source. Kept apart from `constants.ts`
 * because `wxt.config.ts` imports it in Node, where `import.meta.env` does not
 * exist, and `constants.ts` reads it.
 */
export const API_URLS = {
  DEVELOPMENT: 'http://localhost:3001/graphql',
} as const;

export const WEB_URLS = {
  DEVELOPMENT: 'http://localhost:3000',
} as const;

interface DefaultApiUrlInput {
  /** True for `wxt` dev (the dev server), false for a build or a zip. */
  dev: boolean;
  /** `VITE_API_URL` at build time, e.g. to point a build at staging. */
  override?: string;
}

/**
 * A store build must never default to localhost; only the dev server does.
 * Any other build without an override gets an empty URL rather than a guess,
 * so every request fails visibly. It cannot throw: `wxt prepare` (postinstall,
 * typecheck) imports this with no `VITE_API_URL`. The release workflow refuses
 * to build without it.
 */
export function resolveDefaultApiUrl({ dev, override }: DefaultApiUrlInput): string {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  return dev ? API_URLS.DEVELOPMENT : '';
}

/**
 * The web app's origin, for links the popup opens (an application, AI
 * settings). It is its own setting because production serves the API and the
 * web app from different hosts, so it cannot be derived from the API URL
 * (JEF-428). Same rules as `resolveDefaultApiUrl`; trailing slashes are
 * dropped so callers can append a path.
 */
export function resolveDefaultWebUrl({ dev, override }: DefaultApiUrlInput): string {
  const trimmed = override?.trim().replace(/\/+$/, '');
  if (trimmed) return trimmed;
  return dev ? WEB_URLS.DEVELOPMENT : '';
}
