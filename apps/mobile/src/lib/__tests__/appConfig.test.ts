import type { ExpoConfig } from 'expo/config';
import appConfig from '../../../app.config';
import appJson from '../../../app.json';
import packageJson from '../../../package.json';

const staticConfig = appJson.expo as unknown as ExpoConfig;

describe('app.config', () => {
  it('takes the app version from package.json', () => {
    const config = appConfig({ config: staticConfig } as never);

    expect(config.version).toBe(packageJson.version);
  });

  it('leaves app.json without a version of its own', () => {
    expect(appJson.expo).not.toHaveProperty('version');
  });

  it('keeps the rest of app.json', () => {
    const config = appConfig({ config: staticConfig } as never);

    expect(config.name).toBe(appJson.expo.name);
    expect(config.slug).toBe(appJson.expo.slug);
  });
});
