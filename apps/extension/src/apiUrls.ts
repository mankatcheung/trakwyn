/**
 * The API the Clipper talks to by default. Kept apart from `constants.ts`
 * because `wxt.config.ts` imports it in Node, where `import.meta.env` does not
 * exist, and `constants.ts` reads it.
 */
export const API_URLS = {
  PRODUCTION: 'https://api.trakwyn.com/graphql',
  DEVELOPMENT: 'http://localhost:3001/graphql',
} as const;

interface DefaultApiUrlInput {
  /** True for `wxt` dev (the dev server), false for a build or a zip. */
  dev: boolean;
  /** `VITE_API_URL` at build time, e.g. to point a build at staging. */
  override?: string;
}

/** A store build must never default to localhost; only the dev server does. */
export function resolveDefaultApiUrl({ dev, override }: DefaultApiUrlInput): string {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  return dev ? API_URLS.DEVELOPMENT : API_URLS.PRODUCTION;
}
