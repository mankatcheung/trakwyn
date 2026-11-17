import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import {
  APPLICATION_DISPLAY_FIELDS_STORAGE_KEY,
  defaultApplicationDisplayFields,
  loadApplicationDisplayFields,
  useApplicationDisplayFields,
} from '#/features/applications/lib/applicationDisplayFields';

function fakeStorage(raw: string | null, failing = false) {
  return {
    getItem: vi.fn(() => {
      if (failing) throw new Error('private mode');
      return raw;
    }),
    setItem: vi.fn(),
  };
}

describe('loadApplicationDisplayFields', () => {
  it('returns all-on defaults when nothing is stored', () => {
    expect(loadApplicationDisplayFields(fakeStorage(null))).toEqual(
      defaultApplicationDisplayFields(),
    );
  });

  it('returns defaults when storage access throws (private mode)', () => {
    expect(loadApplicationDisplayFields(fakeStorage('{}', true))).toEqual(
      defaultApplicationDisplayFields(),
    );
  });

  it('returns defaults for unparseable JSON', () => {
    expect(loadApplicationDisplayFields(fakeStorage('{not json'))).toEqual(
      defaultApplicationDisplayFields(),
    );
  });

  it('returns defaults for non-object payloads', () => {
    expect(loadApplicationDisplayFields(fakeStorage('["location"]'))).toEqual(
      defaultApplicationDisplayFields(),
    );
    expect(loadApplicationDisplayFields(fakeStorage('42'))).toEqual(
      defaultApplicationDisplayFields(),
    );
  });

  it('applies only the known boolean entries and keeps defaults for the rest', () => {
    const stored = JSON.stringify({
      location: false,
      bogus: false,
      date: 'no',
      status: true,
    });
    const fields = loadApplicationDisplayFields(fakeStorage(stored));
    expect(fields.location).toBe(false);
    expect(fields.status).toBe(true);
    // Unknown keys and non-boolean values never turn a field off.
    expect(fields.role).toBe(true);
    expect(fields.date).toBe(true);
  });
});

describe('useApplicationDisplayFields', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('toggles a field and persists the whole preference', () => {
    const { result } = renderHook(() => useApplicationDisplayFields());

    expect(result.current.fields.location).toBe(true);
    act(() => result.current.toggleField('location'));

    expect(result.current.fields.location).toBe(false);
    const stored = JSON.parse(
      localStorage.getItem(APPLICATION_DISPLAY_FIELDS_STORAGE_KEY) ?? '{}',
    ) as Record<string, boolean>;
    expect(stored.location).toBe(false);
    // Untouched fields persist as on, so a partial entry never disables them.
    expect(stored.role).toBe(true);
  });

  it('starts from a previously stored preference', () => {
    localStorage.setItem(APPLICATION_DISPLAY_FIELDS_STORAGE_KEY, JSON.stringify({ tags: false }));
    const { result } = renderHook(() => useApplicationDisplayFields());
    expect(result.current.fields.tags).toBe(false);
    expect(result.current.fields.date).toBe(true);
  });
});
