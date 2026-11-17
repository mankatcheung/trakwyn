import { useCallback, useEffect, useState } from 'react';

/**
 * Which detail fields the applications list rows and board cards render.
 * Company is deliberately absent — it is the identity anchor of a row/card
 * and is always shown. Everything here was already fetched by both views'
 * queries, so this is purely a display preference: no API changes.
 */
export const APPLICATION_DISPLAY_FIELDS = [
  'role',
  'location',
  'date',
  'tags',
  'status',
  'starred',
  'ghosted',
] as const;

export type ApplicationDisplayField = (typeof APPLICATION_DISPLAY_FIELDS)[number];

export type ApplicationDisplayFields = Record<ApplicationDisplayField, boolean>;

export const APPLICATION_DISPLAY_FIELDS_STORAGE_KEY = 'applications.displayFields';

/** Every field on by default — matches the pre-JEF-230 fixed rendering exactly. */
export function defaultApplicationDisplayFields(): ApplicationDisplayFields {
  return {
    role: true,
    location: true,
    date: true,
    tags: true,
    status: true,
    starred: true,
    ghosted: true,
  };
}

function isApplicationDisplayField(value: unknown): value is ApplicationDisplayField {
  return (
    typeof value === 'string' && (APPLICATION_DISPLAY_FIELDS as readonly string[]).includes(value)
  );
}

/**
 * Reads the stored preference, tolerating every bad shape a hand-edited or
 * partially-written entry can take: unparseable JSON, non-object payloads,
 * unknown field names and non-boolean values all degrade to the defaults for
 * just the affected pieces — a stored `{ location: false }` still keeps the
 * other six fields on.
 */
export function loadApplicationDisplayFields(
  storage: Pick<Storage, 'getItem'> | undefined = typeof window === 'undefined'
    ? undefined
    : window.localStorage,
): ApplicationDisplayFields {
  const fields = defaultApplicationDisplayFields();
  if (!storage) return fields;
  let raw: string | null;
  try {
    raw = storage.getItem(APPLICATION_DISPLAY_FIELDS_STORAGE_KEY);
  } catch {
    // Private-mode Safari and friends can throw on access; defaults are fine.
    return fields;
  }
  if (!raw) return fields;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return fields;
    for (const [key, value] of Object.entries(parsed)) {
      if (isApplicationDisplayField(key) && typeof value === 'boolean') {
        fields[key] = value;
      }
    }
  } catch {
    return defaultApplicationDisplayFields();
  }
  return fields;
}

/**
 * Display preference shared by the list view and the board — toggling a field
 * in either place persists to localStorage so both views agree, including
 * across navigations between them.
 */
export function useApplicationDisplayFields() {
  const [fields, setFields] = useState<ApplicationDisplayFields>(() =>
    loadApplicationDisplayFields(),
  );

  useEffect(() => {
    try {
      localStorage.setItem(APPLICATION_DISPLAY_FIELDS_STORAGE_KEY, JSON.stringify(fields));
    } catch {
      // Same private-mode story as the read: losing persistence must not
      // lose the in-session preference.
    }
  }, [fields]);

  const toggleField = useCallback((field: ApplicationDisplayField) => {
    setFields((prev) => ({ ...prev, [field]: !prev[field] }));
  }, []);

  return { fields, toggleField };
}
