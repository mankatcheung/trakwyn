import Constants from 'expo-constants';

/** The release a build without a commit SHA reports, as the API and web app do. */
export const RELEASE_FALLBACK = 'dev';

/**
 * The commit SHA this build was made from (JEF-362), baked into
 * `extra.release` by app.config.ts. Read at runtime rather than inlined, so
 * it is whatever the build that produced the running bundle recorded.
 */
export function getRelease(): string {
  const release: unknown = Constants.expoConfig?.extra?.release;
  return typeof release === 'string' && release ? release : RELEASE_FALLBACK;
}
