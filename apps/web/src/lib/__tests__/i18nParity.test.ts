import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SUPPORTED_LOCALES, type Locale } from '#/lib/i18n';

/**
 * Keeps the locale bundles in step with each other and with the code (JEF-340).
 *
 * `en` is i18next's `fallbackLng`, so a key missing from `en.json` renders as
 * the raw key in every locale, while a key missing from any other bundle
 * quietly falls back to English. Neither shows up in a type check, which is
 * how both kinds of gap built up unnoticed.
 *
 * Plural forms are compared per locale rather than literally: i18next looks
 * up `key_<category>` using the locale's CLDR plural categories, so `en` needs
 * `_one` and `_other` while Chinese only ever asks for `_other`.
 */

const SRC = join(import.meta.dirname, '..', '..');
const I18N_DIR = join(SRC, 'i18n');
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const SKIPPED_DIRS = new Set(['__tests__', 'i18n', 'generated']);

type Bundle = Record<string, string>;

function loadBundle(locale: Locale): Bundle {
  return JSON.parse(readFileSync(join(I18N_DIR, `${locale}.json`), 'utf8')) as Bundle;
}

/** The keys `locale` should define, given the keys `en` defines. */
function expectedKeys(enKeys: string[], locale: Locale): Set<string> {
  const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories;
  const expected = new Set<string>();
  for (const key of enKeys) {
    if (PLURAL_SUFFIX.test(key)) {
      const base = key.replace(PLURAL_SUFFIX, '');
      for (const category of categories) expected.add(`${base}_${category}`);
    } else {
      expected.add(key);
    }
  }
  return expected;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();
}

/** Comments quote example keys ("status.foo") that were never meant to resolve. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.gen.ts') ? [path] : [];
  });
}

const en = loadBundle('en');
const enKeys = Object.keys(en);

describe('i18n bundle parity', () => {
  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))(
    '%s defines exactly the keys en does',
    (locale) => {
      const actual = new Set(Object.keys(loadBundle(locale)));
      const expected = expectedKeys(enKeys, locale);

      expect({
        missing: [...expected].filter((k) => !actual.has(k)),
        extra: [...actual].filter((k) => !expected.has(k)),
      }).toEqual({ missing: [], extra: [] });
    },
  );

  it('en defines every plural form English needs', () => {
    const actual = new Set(enKeys);
    expect([...expectedKeys(enKeys, 'en')].filter((k) => !actual.has(k))).toEqual([]);
  });

  it.each(SUPPORTED_LOCALES.filter((l) => l !== 'en'))(
    '%s uses the same interpolation placeholders as en',
    (locale) => {
      const bundle = loadBundle(locale);
      const mismatched = Object.entries(bundle).filter(([key, value]) => {
        const source = en[key] ?? en[key.replace(PLURAL_SUFFIX, '_other')];
        return source !== undefined && placeholders(value).join() !== placeholders(source).join();
      });
      expect(mismatched.map(([key]) => key)).toEqual([]);
    },
  );
});

describe('i18n keys used in code', () => {
  // Any quoted string shaped like a key in one of en's namespaces — not just
  // `t('…')` arguments, since several pages keep keys in arrays or props and
  // call `t(key)` later.
  const namespaces = new Set(enKeys.map((k) => k.split('.')[0]));
  const keyLiteral = /['"`]([a-zA-Z]+\.[a-zA-Z0-9_.]+)['"`]/g;
  const isDefined = (key: string) =>
    key in en || `${key}_other` in en || enKeys.some((k) => k.startsWith(`${key}.`));

  it('every literal key in src exists in en.json', () => {
    const missing = sourceFiles(SRC).flatMap((file) => {
      const text = stripComments(readFileSync(file, 'utf8'));
      return [...text.matchAll(keyLiteral)]
        .map((m) => m[1])
        .filter((key) => namespaces.has(key.split('.')[0]) && !isDefined(key))
        .map((key) => `${relative(SRC, file)}: ${key}`);
    });
    expect(missing).toEqual([]);
  });
});
