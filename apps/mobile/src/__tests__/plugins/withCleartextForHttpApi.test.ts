import type { ExpoConfig } from 'expo/config';
import withCleartextForHttpApi from '../../../plugins/withCleartextForHttpApi';

/**
 * The plugin decides from EXPO_PUBLIC_API_URL alone, so the tests drive it
 * through the environment the way `expo prebuild` does, and read the result
 * back off the manifest mod it registers rather than running a prebuild.
 */

type ManifestMod = (
  config: unknown,
) => Promise<{ modResults: FakeManifest }> | { modResults: FakeManifest };

interface FakeManifest {
  manifest: { application: { $: Record<string, string> }[] };
}

const baseConfig = (): ExpoConfig => ({ name: 'trakwyn', slug: 'trakwyn' });

const fakeManifest = (): FakeManifest => ({
  manifest: { application: [{ $: { 'android:name': '.MainApplication' } }] },
});

async function applyManifestMod(config: ExpoConfig, manifest: FakeManifest): Promise<FakeManifest> {
  const mod = (config as { mods?: { android?: { manifest?: ManifestMod } } }).mods?.android
    ?.manifest;
  if (!mod) throw new Error('the plugin registered no android manifest mod');
  const result = await mod({ ...config, modResults: manifest, modRequest: {} });
  return result.modResults;
}

describe('withCleartextForHttpApi', () => {
  const original = process.env.EXPO_PUBLIC_API_URL;

  afterEach(() => {
    if (original === undefined) delete process.env.EXPO_PUBLIC_API_URL;
    else process.env.EXPO_PUBLIC_API_URL = original;
  });

  describe('apiUrlNeedsCleartext', () => {
    it.each([
      ['http://10.0.2.2:3001/graphql', true],
      ['http://localhost:3001/graphql', true],
      ['https://api.trakwyn.com/graphql', false],
      ['', false],
      [undefined, false],
    ])('%p -> %p', (url, expected) => {
      expect(withCleartextForHttpApi.apiUrlNeedsCleartext(url)).toBe(expected);
    });
  });

  it('allows cleartext in the main manifest when the API URL is plain http', async () => {
    process.env.EXPO_PUBLIC_API_URL = 'http://10.0.2.2:3001/graphql';

    const config = withCleartextForHttpApi(baseConfig());
    const manifest = await applyManifestMod(config, fakeManifest());

    expect(manifest.manifest.application[0].$['android:usesCleartextTraffic']).toBe('true');
  });

  it('leaves the config untouched when the API URL is https', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.trakwyn.com/graphql';

    const input = baseConfig();
    const config = withCleartextForHttpApi(input);

    expect(config).toBe(input);
    expect((config as { mods?: unknown }).mods).toBeUndefined();
  });

  it('leaves the config untouched when no API URL is given', () => {
    delete process.env.EXPO_PUBLIC_API_URL;

    const input = baseConfig();
    expect(withCleartextForHttpApi(input)).toBe(input);
  });
});
