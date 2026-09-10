import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

/**
 * Which detail fields the applications list rows render, mirroring
 * apps/web's `applicationDisplayFields.ts`. Company is deliberately absent —
 * it is the identity anchor of a row and is always shown.
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

const STORAGE_KEY = 'trakwyn_applications_display_fields';

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

// Mirrors src/theme/themeStorage.ts: expo-secure-store has no web
// implementation, so the web preview target falls back to localStorage.
const storage = {
  getItem: (key: string): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
      : SecureStore.getItemAsync(key),
  setItem: (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      globalThis.localStorage?.setItem(key, value);
      return Promise.resolve();
    }
    return SecureStore.setItemAsync(key, value);
  },
};

/**
 * Reads the stored preference, tolerating every bad shape a partially
 * written entry can take: unparseable JSON, non-object payloads, unknown
 * field names and non-boolean values all degrade to the defaults for just
 * the affected pieces.
 */
export async function loadApplicationDisplayFields(): Promise<ApplicationDisplayFields> {
  const fields = defaultApplicationDisplayFields();
  let raw: string | null;
  try {
    raw = await storage.getItem(STORAGE_KEY);
  } catch {
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

export async function saveApplicationDisplayFields(
  fields: ApplicationDisplayFields,
): Promise<void> {
  try {
    await storage.setItem(STORAGE_KEY, JSON.stringify(fields));
  } catch {
    // Losing persistence must not lose the in-session preference.
  }
}

/**
 * Display preference for the applications list — toggling a field persists
 * across app restarts. Loads asynchronously, so callers see the defaults
 * for one render before the stored value (if any) arrives.
 */
export function useApplicationDisplayFields() {
  const [fields, setFields] = useState<ApplicationDisplayFields>(defaultApplicationDisplayFields);

  useEffect(() => {
    let cancelled = false;
    void loadApplicationDisplayFields().then((loaded) => {
      if (!cancelled) setFields(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleField = useCallback((field: ApplicationDisplayField) => {
    setFields((prev) => {
      const next = { ...prev, [field]: !prev[field] };
      void saveApplicationDisplayFields(next);
      return next;
    });
  }, []);

  return { fields, toggleField };
}
