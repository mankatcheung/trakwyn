import type { ConfigContext, ExpoConfig } from 'expo/config';
import packageJson from './package.json';

/**
 * app.json stays the source of truth for the app's config; this only adds
 * the app version and the release PostHog tags every event with (JEF-362).
 *
 * The version is package.json's, the one release-please bumps (JEF-389), so
 * app.json carries none. It is what the stores show and what the User-Agent
 * reports (src/lib/userAgent.ts).
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
  version: packageJson.version,
  extra: {
    ...config.extra,
    release: process.env.EAS_BUILD_GIT_COMMIT_HASH || process.env.APP_RELEASE || 'dev',
  },
});
