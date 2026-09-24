import en from '../locales/en';
import enGB from '../locales/en-GB';
import zhCN from '../locales/zh-CN';
import zhHK from '../locales/zh-HK';
import zhTW from '../locales/zh-TW';
import { SUPPORTED_LANGUAGES, type LanguageCode } from '../config';

/**
 * Keeps every locale's bundle in step with `en`, the fallback language
 * (JEF-340). A key missing from a non-English bundle silently renders English,
 * so nothing else would notice.
 *
 * Plural forms are compared per locale: i18next looks up `key_<category>`
 * using the locale's CLDR plural categories, so `en` needs `_one` and
 * `_other` while Chinese only ever asks for `_other`.
 */

type Tree = { [key: string]: string | Tree };

const BUNDLES: Record<LanguageCode, Tree> = {
  en,
  'en-GB': enGB,
  'zh-CN': zhCN,
  'zh-HK': zhHK,
  'zh-TW': zhTW,
};

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`),
  );
}

function expectedKeys(enKeys: string[], locale: LanguageCode): Set<string> {
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

const enKeys = flatten(BUNDLES.en);
const otherLocales = SUPPORTED_LANGUAGES.map((l) => l.code).filter((code) => code !== 'en');

describe('mobile locale parity', () => {
  it('has a bundle for every supported language', () => {
    expect(Object.keys(BUNDLES).sort()).toEqual(SUPPORTED_LANGUAGES.map((l) => l.code).sort());
  });

  it.each(otherLocales)('%s has the same namespaces as en', (locale) => {
    expect(Object.keys(BUNDLES[locale]).sort()).toEqual(Object.keys(BUNDLES.en).sort());
  });

  it.each(otherLocales)('%s defines exactly the keys en does', (locale) => {
    const actual = new Set(flatten(BUNDLES[locale]));
    const expected = expectedKeys(enKeys, locale);

    expect({
      missing: [...expected].filter((k) => !actual.has(k)),
      extra: [...actual].filter((k) => !expected.has(k)),
    }).toEqual({ missing: [], extra: [] });
  });

  it('en defines every plural form English needs', () => {
    const actual = new Set(enKeys);
    expect([...expectedKeys(enKeys, 'en')].filter((k) => !actual.has(k))).toEqual([]);
  });
});
