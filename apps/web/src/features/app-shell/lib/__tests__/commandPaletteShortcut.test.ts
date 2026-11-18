import { describe, expect, it } from 'vitest';
import { isCommandPaletteShortcut } from '#/features/app-shell/lib/commandPaletteShortcut';

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('isCommandPaletteShortcut (JEF-537)', () => {
  it('matches Cmd+Shift+K and Ctrl+Shift+K', () => {
    expect(isCommandPaletteShortcut(press({ key: 'k', metaKey: true, shiftKey: true }))).toBe(true);
    expect(isCommandPaletteShortcut(press({ key: 'k', ctrlKey: true, shiftKey: true }))).toBe(true);
  });

  it('matches the capital K Shift produces', () => {
    expect(isCommandPaletteShortcut(press({ key: 'K', metaKey: true, shiftKey: true }))).toBe(true);
  });

  it.each([
    ['no modifier', { key: 'k' }],
    ['Shift alone', { key: 'k', shiftKey: true }],
    ['Cmd without Shift', { key: 'k', metaKey: true }],
    ['Ctrl without Shift', { key: 'k', ctrlKey: true }],
    ['another key', { key: 'j', metaKey: true, shiftKey: true }],
    ['Alt instead of Cmd/Ctrl', { key: 'k', altKey: true, shiftKey: true }],
  ])('does not match %s', (_name, init) => {
    expect(isCommandPaletteShortcut(press(init))).toBe(false);
  });
});
