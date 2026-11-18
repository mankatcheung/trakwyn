import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { MARK_COMMANDS, readMarkState, runMarkCommand, type MarkId } from '../editorMarkCommands';

function fakeEditor(active: string[] = [], href?: string) {
  const run = vi.fn();
  const chain: Record<string, unknown> = {};
  for (const m of [
    'toggleBold',
    'toggleItalic',
    'toggleUnderline',
    'toggleStrike',
    'toggleHighlight',
  ]) {
    chain[m] = vi.fn(() => ({ run }));
  }
  const focus = vi.fn(() => chain);
  const editor = {
    isActive: (name: string) => active.includes(name),
    getAttributes: () => (href === undefined ? {} : { href }),
    chain: () => ({ focus }),
  } as unknown as Editor;
  return { editor, chain, focus, run };
}

describe('MARK_COMMANDS', () => {
  it('lists each mark once with a label key, shortcut and icon', () => {
    expect(MARK_COMMANDS.map((c) => c.id)).toEqual([
      'bold',
      'italic',
      'underline',
      'strike',
      'highlight',
    ]);
    for (const c of MARK_COMMANDS) {
      expect(c.labelKey).toMatch(/^documents\.editor\./);
      expect(c.shortcut).toMatch(/^Mod-/);
      expect(c.Icon).toBeTruthy();
    }
  });
});

describe('readMarkState', () => {
  it('reports every mark as inactive on a plain selection', () => {
    expect(readMarkState(fakeEditor().editor)).toEqual({
      bold: false,
      italic: false,
      underline: false,
      strike: false,
      highlight: false,
      link: false,
      linkHref: '',
    });
  });

  it('reports the active marks and the link target', () => {
    const state = readMarkState(fakeEditor(['bold', 'link'], 'https://a.test').editor);
    expect(state).toMatchObject({ bold: true, link: true, linkHref: 'https://a.test' });
    expect(state.italic).toBe(false);
  });
});

describe('runMarkCommand', () => {
  it.each<[MarkId, string]>([
    ['bold', 'toggleBold'],
    ['italic', 'toggleItalic'],
    ['underline', 'toggleUnderline'],
    ['strike', 'toggleStrike'],
    ['highlight', 'toggleHighlight'],
  ])('focuses the editor and runs %s via %s', (id, method) => {
    const { editor, chain, focus, run } = fakeEditor();
    runMarkCommand(editor, id);
    expect(focus).toHaveBeenCalledOnce();
    expect(chain[method]).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledOnce();
  });
});
