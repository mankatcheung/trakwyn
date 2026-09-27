import Constants from 'expo-constants';
import { getRelease } from '../release';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: null },
}));

const mockedConstants = Constants as unknown as { expoConfig: unknown };

describe('getRelease', () => {
  it('returns the commit SHA app.config.ts baked into extra', () => {
    mockedConstants.expoConfig = { extra: { release: 'abc123def456' } };

    expect(getRelease()).toBe('abc123def456');
  });

  it.each([
    ['no expo config', null],
    ['no extra', {}],
    ['no release', { extra: {} }],
    ['an empty release', { extra: { release: '' } }],
    ['a non-string release', { extra: { release: 42 } }],
  ])('falls back to dev with %s', (_label, expoConfig) => {
    mockedConstants.expoConfig = expoConfig;

    expect(getRelease()).toBe('dev');
  });
});
