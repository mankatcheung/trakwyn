import { beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, renderHook, screen, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DocumentDraftEditor } from '#/routes/_authenticated/applications/$applicationId/-components/DocumentDraftEditor';
import {
  DOCUMENT_LANGUAGES,
  documentLanguageForLocale,
  readDocumentLanguage,
  useDocumentLanguage,
  writeDocumentLanguage,
  type DocumentLanguageTag,
} from '#/lib/editor/documentLanguage';

// jsdom has no layout; ProseMirror asks for rects when it scrolls the selection into view.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 } as DOMRect;
  const rects = Object.assign([] as unknown as DOMRectList, { item: () => null });
  Range.prototype.getBoundingClientRect = () => rect;
  Range.prototype.getClientRects = () => rects;
  (Text.prototype as unknown as { getClientRects: () => DOMRectList }).getClientRects = () => rects;
});

beforeEach(() => window.localStorage.clear());

const content = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }],
});
const prose = () => document.querySelector('.ProseMirror')!;

function Harness() {
  const [value, onChange] = useState<DocumentLanguageTag>('en-GB');
  return (
    <DocumentDraftEditor contentJson={content} onUpdate={vi.fn()} language={{ value, onChange }} />
  );
}

describe('document language and spellcheck (JEF-579)', () => {
  it('asks for spellcheck explicitly and sets the language on the editing area', () => {
    render(<Harness />);
    expect(prose()).toHaveAttribute('spellcheck', 'true');
    expect(prose()).toHaveAttribute('lang', 'en-GB');
  });

  it('still turns spellcheck on when no language is given', () => {
    render(<DocumentDraftEditor contentJson={content} onUpdate={vi.fn()} />);
    expect(prose()).toHaveAttribute('spellcheck', 'true');
    expect(prose()).not.toHaveAttribute('lang');
  });

  it('changes the spellcheck language when the language is picked', async () => {
    render(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Document language' }), [
      'fr',
    ]);
    expect(prose()).toHaveAttribute('lang', 'fr');
    expect(prose()).toHaveAttribute('spellcheck', 'true');
  });

  it('lists the languages by their own names', () => {
    render(<Harness />);
    const picker = screen.getByRole('combobox', { name: 'Document language' });
    const options = within(picker)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(DOCUMENT_LANGUAGES.map((l) => l.label));
  });

  it('sends nothing over the network while editing and spellchecking', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    render(<Harness />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Document language' }), [
      'de',
    ]);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('documentLanguage helpers', () => {
  it("maps the app's language to a document language, with en as American English", () => {
    expect(documentLanguageForLocale('en')).toBe('en-US');
    expect(documentLanguageForLocale('en-GB')).toBe('en-GB');
    expect(documentLanguageForLocale('zh-HK')).toBe('zh-HK');
  });

  it('remembers the choice per draft', () => {
    writeDocumentLanguage('a', 'fr');
    expect(readDocumentLanguage('a')).toBe('fr');
    expect(readDocumentLanguage('b')).toBeNull();
  });

  it('ignores a stored value that is not a known language', () => {
    window.localStorage.setItem('documentLanguage:a', 'klingon');
    expect(readDocumentLanguage('a')).toBeNull();
  });

  it('survives storage that throws', () => {
    const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readDocumentLanguage('a')).toBeNull();
    expect(() => writeDocumentLanguage('a', 'fr')).not.toThrow();
    get.mockRestore();
    set.mockRestore();
  });

  it("defaults to the app's language and keeps a choice for the next visit", () => {
    const first = renderHook(() => useDocumentLanguage('d1', 'zh-TW'));
    expect(first.result.current[0]).toBe('zh-TW');

    act(() => first.result.current[1]('es'));
    expect(first.result.current[0]).toBe('es');

    const next = renderHook(() => useDocumentLanguage('d1', 'en'));
    expect(next.result.current[0]).toBe('es');
    const other = renderHook(() => useDocumentLanguage('d2', 'en'));
    expect(other.result.current[0]).toBe('en-US');
  });
});
