import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json stays the source of truth for the app's config; this only adds
 * the release PostHog tags every event with (JEF-362).
 *
 * The release is the git commit SHA the JS bundle was built from, the same
 * value the API reports as `service.version` and the web app as `release`.
 * EAS Build sets `EAS_BUILD_GIT_COMMIT_HASH`; `APP_RELEASE` is for a build
 * pipeline that doesn't run on EAS (JEF-300). Anything else, a local
 * `expo start` included, reports `dev`, matching `RELEASE_FALLBACK` in
 * src/lib/release.ts.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    release: process.env.EAS_BUILD_GIT_COMMIT_HASH || process.env.APP_RELEASE || 'dev',
  },
});
