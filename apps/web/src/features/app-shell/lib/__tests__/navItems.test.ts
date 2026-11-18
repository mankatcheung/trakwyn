import { describe, expect, it } from 'vitest';
import en from '#/i18n/en.json';
import { MAIN_NAV, SETTINGS_NAV } from '#/features/app-shell/lib/navItems';

describe.each([
  ['MAIN_NAV', MAIN_NAV],
  ['SETTINGS_NAV', SETTINGS_NAV],
])('%s', (_name, items) => {
  it('has unique destinations', () => {
    const targets = items.map((item) => item.to);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it('labels every item with a key that exists in the English copy', () => {
    for (const item of items) {
      expect(en).toHaveProperty([item.labelKey]);
    }
  });

  it('gives every item an icon', () => {
    for (const item of items) {
      expect(item.icon).toBeTruthy();
    }
  });
});

describe('SETTINGS_NAV', () => {
  it('keeps every item under /settings', () => {
    for (const item of SETTINGS_NAV) expect(item.to).toMatch(/^\/settings\//);
  });

  it('puts the danger zone last, the only irreversible action', () => {
    expect(SETTINGS_NAV.at(-1)?.to).toBe('/settings/danger-zone');
  });
});

describe('MAIN_NAV', () => {
  it('starts at the dashboard', () => {
    expect(MAIN_NAV[0].to).toBe('/dashboard');
  });
});
