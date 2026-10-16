// Allow plain-HTTP API traffic in a build whose API URL is plain HTTP (JEF-300).
//
// Android refuses cleartext traffic by default from API 28 on. Expo's prebuild
// re-enables it, but only in the debug and debugOptimized manifests — the
// release variant keeps the platform default. The e2e tier builds a *release*
// APK pointed at http://10.0.2.2:3001 (the emulator's route to the host), so
// without this every request from the app failed on-device before it left
// the process, and the first two device runs of the Maestro flows ended with
// the API having seen nothing but the workflow's own curl health check.
//
// The decision is derived from EXPO_PUBLIC_API_URL rather than from a build
// profile: cleartext is needed exactly when the URL the bundle was given is
// http://, and never for the https:// production API. Reading the env here is
// safe because `expo prebuild` inlines that same variable into the bundle in
// the same process (apps/mobile/src/constants.ts), so the manifest and the
// bundle can never disagree about which URL the build talks to.

const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

/** True when the API URL the build was given cannot be reached over TLS. */
function apiUrlNeedsCleartext(apiUrl) {
  return typeof apiUrl === 'string' && apiUrl.startsWith('http://');
}

function withCleartextForHttpApi(config) {
  if (!apiUrlNeedsCleartext(process.env.EXPO_PUBLIC_API_URL)) return config;
  return withAndroidManifest(config, (mod) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    application.$['android:usesCleartextTraffic'] = 'true';
    return mod;
  });
}

module.exports = withCleartextForHttpApi;
module.exports.apiUrlNeedsCleartext = apiUrlNeedsCleartext;
